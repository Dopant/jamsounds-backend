import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { normalizeArtistLinks } from '../src/utils/artistLinks.js';
import { articleBody, articleMetadata, renderDocument, sitemapXml } from '../src/utils/seo.js';
import { createSeoRouter } from '../src/routes/seo.js';
const post = { id: 42, title: 'New <Sound>', excerpt: 'A global music review', content: '<p>A review</p><script>alert(1)</script><img src="x" onerror="alert(2)">', author_name: 'Editor', hero_image_url: '/uploads/music.jpg', created_at: '2026-10-01', updated_at: '2026-10-06' };
const shell = '<html><head><title>Old</title><meta name="description" content="old"><script type="module" src="/assets/app.js"></script></head><body><div id="root"></div></body></html>';
test('artist links round trip new and existing keys; reject executable URLs', () => {
  assert.deepEqual(normalizeArtistLinks(JSON.stringify({ tiktok: 'https://tiktok.com/@artist', instagram: 'https://instagram.com/artist', website: 'https://artist.com', spotify: 'https://open.spotify.com/artist/abc', youtube: '' })), { tiktok: 'https://tiktok.com/@artist', instagram: 'https://instagram.com/artist', website: 'https://artist.com/', spotify: 'https://open.spotify.com/artist/abc' });
  for (const value of ['javascript:alert(1)', 'data:text/html,bad', 'https://user:pass@example.com', 'bad']) assert.throws(() => normalizeArtistLinks({ website: value }));
  assert.equal(normalizeArtistLinks(undefined), undefined); assert.deepEqual(normalizeArtistLinks({ website: '' }), {});
});
test('article HTML contains content and unique metadata without executable body HTML', () => {
  const metadata = articleMetadata(post, 'https://jamjournal.com');
  const html = renderDocument(shell, metadata, articleBody(post), { article: true });
  assert.match(html, /New &lt;Sound&gt; \| JamJournal/); assert.match(html, /A review/); assert.match(html, /BlogPosting/);
  assert.match(html, /https:\/\/jamjournal.com\/blog\/post\/42/); assert.match(html, /\/assets\/app.js/);
  assert.doesNotMatch(html, /onerror|<script>alert|<title>Old/); assert.equal((html.match(/<title>/g) || []).length, 1);
});
test('sitemap includes existing article URLs and dates, excludes admin', () => {
  const xml = sitemapXml([post], 'https://jamjournal.com'); assert.match(xml, /\/blog\/post\/42/); assert.match(xml, /2026-10-06/); assert.doesNotMatch(xml, /admin|rating|views/);
});
test('rendering serves articles, 404s, noindex admin, metadata and sitemap without counter writes', async () => {
  const app = express(); app.use(createSeoRouter({ getPost: async id => id === '42' ? post : null, getPosts: async () => [post], readShell: async () => shell }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const article = await fetch(origin + '/blog/post/42'); assert.equal(article.status, 200); assert.match(await article.text(), /A review/);
    const missing = await fetch(origin + '/blog/post/99'); assert.equal(missing.status, 404); assert.match(await missing.text(), /noindex/);
    const admin = await fetch(origin + '/admin/login'); assert.match(await admin.text(), /noindex/);
    assert.equal((await fetch(origin + '/no-such-page')).status, 404);
    const meta = await (await fetch(origin + '/api/seo/article/42')).json(); assert.equal(meta.schema['@type'], 'BlogPosting');
    const sitemap = await fetch(origin + '/sitemap.xml'); assert.match(sitemap.headers.get('content-type'), /xml/); assert.match(await sitemap.text(), /\/blog\/post\/42/);
    assert.match(await (await fetch(origin + '/robots.txt')).text(), /Sitemap:/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('search matches genre and media artist using parameterized terms', async () => {
  const { default: pool } = await import('../src/db.js');
  const { getAllPosts, getRediscoverPosts } = await import('../src/models/blogPost.js');
  const original = pool.query;
  try {
    let captured;
    pool.query = async (sql, params) => { captured = { sql, params }; return [[]]; };
    await getAllPosts({ search: "Artist' OR 1=1", limit: 8 });
    assert.match(captured.sql, /g.name LIKE \?/); assert.match(captured.sql, /m.artist LIKE \?/);
    assert.doesNotMatch(captured.sql, /Artist' OR 1=1/); assert.equal(captured.params.length, 6);
    assert.equal(captured.params[0], "%Artist' OR 1=1%");
    const result = await getRediscoverPosts(8); assert.deepEqual(result, []);
  } finally { pool.query = original; }
});

test('literal dollar replacement sequences in article text do not alter the document', () => {
  const body = articleBody({ ...post, content: '<p>$& $$ $\u0027 $`</p>' });
  const html = renderDocument(shell, articleMetadata(post), body);
  assert.match(html, /\$&amp;|\$&/); assert.equal((html.match(/<div id="root">/g) || []).length, 1);
});

test('retained local media IDs support existing editor IDs and reject malformed values', async () => {
  const { normalizeRetainedMediaIds } = await import('../src/utils/artistLinks.js');
  assert.deepEqual(normalizeRetainedMediaIds('["12",13,"12"]'), [12,13]);
  assert.deepEqual(normalizeRetainedMediaIds('[]'), []);
  assert.equal(normalizeRetainedMediaIds(undefined), undefined);
  for (const raw of ['{}', '["x"]', '[0]', '[-1]', '[9007199254740993]', 'invalid']) assert.throws(() => normalizeRetainedMediaIds(raw));
});
