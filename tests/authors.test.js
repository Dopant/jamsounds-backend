import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import { validateAuthor, validAuthorId, createAuthorStore } from '../src/models/author.js';
import { createAuthorsRouter } from '../src/routes/authors.js';
import pool from '../src/db.js';
import { createPost, updatePost, getAllPosts, getPostById, getPostsByCategory } from '../src/models/blogPost.js';

test('profiles require a name and reject unsafe photos and invalid IDs', () => {
  assert.deepEqual(validateAuthor({ name: ' Emmanuel ', bio: ' His bio ' }), { name: 'Emmanuel', bio: 'His bio', avatar: '' });
  for (const name of ['', ' ', 'x'.repeat(192)]) assert.throws(() => validateAuthor({ name }));
  for (const avatar of ['javascript:alert(1)', 'data:x', 'https://user:pass@example.com', '/uploads/../secret']) assert.throws(() => validateAuthor({ name: 'Editor', avatar }));
  for (const avatar of ['https://example.com/photo.png', '/uploads/123-photo.webp']) assert.equal(validateAuthor({ name: 'Editor', avatar }).avatar, avatar);
  for (const id of ['', 0, -1, '1abc', '1.5', '9007199254740993']) assert.throws(() => validAuthorId(id));
});

test('selected IDs control bylines, omitted authors preserve edits, legacy names get empty profiles', async () => {
  const queries = [];
  const store = createAuthorStore({ query: async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes('WHERE id')) return [[{ id: 2, name: 'Emmanuel', bio: 'His bio', avatar: '' }]];
    if (sql.includes('WHERE name')) return [[{ id: 3, name: 'Kelvin' }]];
    return [{}];
  } });
  assert.deepEqual(await store.resolve({ author_profile_id: '2', author_name: 'Mariam' }), { author_profile_id: 2, author_name: 'Emmanuel' });
  assert.deepEqual(await store.resolve({}, { author_profile_id: 2, author_name: 'Emmanuel' }), { author_profile_id: 2, author_name: 'Emmanuel' });
  assert.deepEqual(await store.resolve({ author_name: 'Kelvin' }, { author_profile_id: 2, author_name: 'Emmanuel' }), { author_profile_id: 3, author_name: 'Kelvin' });
  assert.match(queries.find(q => q.sql.startsWith('INSERT')).sql, /VALUES \(\?, '', ''\)/);
  await assert.rejects(store.resolve({ author_profile_id: 'bad' }));
  await assert.rejects(createAuthorStore({ query: async () => [[]] }).resolve({ author_profile_id: 99 }), /not found/);
});

test('author API requires authentication and supports separate profiles, updates, conflicts and validation', async () => {
  process.env.JWT_SECRET = 'author-test-secret';
  const records = [{ id: 1, name: 'Mariam', bio: 'Mariam bio', avatar: '' }, { id: 2, name: 'Emmanuel', bio: 'Emmanuel bio', avatar: '' }];
  const store = { list: async () => records, get: async id => records.find(a => a.id === id), create: async profile => {
    if (records.some(a => a.name === profile.name)) throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
    const row = { id: records.length + 1, ...profile }; records.push(row); return row;
  }, update: async (id, profile) => Object.assign(records.find(a => a.id === id), profile) };
  const app = express(); app.use(express.json()); app.use('/api/authors', createAuthorsRouter(store));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}/api/authors`;
  const headers = { Authorization: 'Bearer ' + jwt.sign({ id: 1 }, process.env.JWT_SECRET), 'Content-Type': 'application/json' };
  try {
    for (const method of ['GET', 'POST', 'PUT']) assert.equal((await fetch(origin + (method === 'PUT' ? '/1' : ''), { method })).status, 401);
    assert.equal((await fetch(origin, { headers: { Authorization: 'Bearer invalid' } })).status, 403);
    const list = await (await fetch(origin, { headers })).json(); assert.notEqual(list[0].bio, list[1].bio);
    assert.equal((await fetch(origin, { method: 'POST', headers, body: JSON.stringify({ name: 'Kelvin', bio: 'Kelvin bio' }) })).status, 201);
    assert.equal((await fetch(origin, { method: 'POST', headers, body: JSON.stringify({ name: 'Mariam' }) })).status, 409);
    assert.equal((await fetch(origin, { method: 'POST', headers, body: '{}' })).status, 400);
    assert.equal((await fetch(origin + '/99', { method: 'PUT', headers, body: JSON.stringify({ name: 'Missing' }) })).status, 404);
    await fetch(origin + '/2', { method: 'PUT', headers, body: JSON.stringify({ name: 'Emmanuel', bio: 'Updated bio' }) });
    assert.equal(records[0].bio, 'Mariam bio'); assert.equal(records[1].bio, 'Updated bio');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('article reads use reusable author profiles; creation and editing persist profile IDs', async () => {
  const original = pool.query; const captured = [];
  pool.query = async (sql, params) => { captured.push({ sql, params }); return sql.startsWith('SELECT') ? [[]] : [{ insertId: 1, affectedRows: 1 }]; };
  try {
    await getAllPosts({}); await getPostById(1); await getPostsByCategory('latest');
    for (const { sql } of captured) { assert.match(sql, /JOIN authors a ON p.author_profile_id = a.id/); assert.doesNotMatch(sql, /JOIN admin/); }
    for (const created_at of [undefined, '2026-10-06']) {
      await createPost({ title: 'Song', content: 'Review', author_id: 1, author_profile_id: 2, author_name: 'Emmanuel', created_at });
      const query = captured.at(-1); assert.equal((query.sql.match(/\?/g) || []).length, query.params.length); assert.equal(query.params[4], 2);
    }
    await updatePost(1, { author_profile_id: 3, author_name: 'Kelvin' });
    assert.match(captured.at(-1).sql, /author_profile_id=\?/); assert.deepEqual(captured.at(-1).params, [3, 'Kelvin', 1]);
  } finally { pool.query = original; }
});

test('migration is repeatable and copies the legacy bio only to the explicitly selected author', async () => {
  const { migrate } = await import('../scripts/migrate-author-profiles.js');
  let addedColumn = false; const calls = [];
  const db = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('information_schema')) return [addedColumn ? [{ COLUMN_NAME: 'author_profile_id' }] : []];
    if (sql.startsWith('ALTER')) addedColumn = true;
    if (sql.startsWith('SELECT id, bio')) return [[{ id: 1, bio: '' }]];
    if (sql.startsWith('SELECT DISTINCT u.bio')) return [[{ bio: 'Mariam bio' }]];
    return [{}];
  } };
  await migrate(db, ['--legacy-bio-author', 'Mariam Jibril']); await migrate(db, []);
  assert.equal(calls.filter(c => c.sql.startsWith('ALTER')).length, 1);
  const copy = calls.find(c => c.sql.startsWith('UPDATE authors SET bio'));
  assert.deepEqual(copy.params, ['Mariam bio', 1, '']);
  assert.match(calls.find(c => c.sql.includes('JOIN admin u ON CONVERT')).sql, /WHERE a.bio = ''/);
  assert.match(calls.find(c => c.sql.startsWith('UPDATE blog_posts')).sql, /WHERE p.author_profile_id IS NULL/);
});

 test('migration explicitly aligns collations for cross-table author-name comparisons', async () => {
  const { migrate } = await import('../scripts/migrate-author-profiles.js');
  const comparisons = [];
  await migrate({ query: async sql => {
    if (sql.includes('information_schema')) return [[{ COLUMN_NAME: 'author_profile_id' }]];
    if (sql.startsWith('SELECT id, bio')) return [[{ id: 1, bio: 'Existing bio' }]];
    if (sql.startsWith('SELECT DISTINCT u.bio')) { comparisons.push(sql); return [[{ bio: 'Legacy bio' }]]; }
    if (sql.startsWith('UPDATE blog_posts') || sql.includes('JOIN admin u ON CONVERT')) comparisons.push(sql);
    return [{}];
  } }, ['--legacy-bio-author', 'Mariam Jibril']);
  assert.equal(comparisons.length, 3);
  for (const sql of comparisons) assert.match(sql, /COLLATE utf8mb4_unicode_ci = .*COLLATE utf8mb4_unicode_ci/);
});
