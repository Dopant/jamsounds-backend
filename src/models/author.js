import pool from '../db.js';

export function validateAuthor(input) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const bio = typeof input.bio === 'string' ? input.bio.trim() : '';
  const avatar = typeof input.avatar === 'string' ? input.avatar.trim() : '';
  if (!name || name.length > 191) throw new Error('Author name is required and must be at most 191 characters');
  if (bio.length > 5000) throw new Error('Author bio must be at most 5000 characters');
  if (avatar && !/^\/uploads\/[a-zA-Z0-9_.-]+$/.test(avatar)) {
    try { const url = new URL(avatar); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(); }
    catch { throw new Error('Photo URL must use http or https, or an existing /uploads/ file'); }
  }
  if (avatar.length > 2048) throw new Error('Photo URL is too long');
  return { name, bio, avatar };
}

export function validAuthorId(value) {
  const id = Number(value);
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(id) || id < 1) throw new Error('Invalid author profile');
  return id;
}

export function createAuthorStore(db = pool) {
  return {
    async list() { const [rows] = await db.query('SELECT id, name, bio, avatar FROM authors ORDER BY name'); return rows; },
    async get(id) { const [rows] = await db.query('SELECT id, name, bio, avatar FROM authors WHERE id = ?', [id]); return rows[0]; },
    async create(profile) {
      const [result] = await db.query('INSERT INTO authors (name, bio, avatar) VALUES (?, ?, ?)', [profile.name, profile.bio, profile.avatar]);
      return { id: result.insertId, ...profile };
    },
    async update(id, profile) {
      await db.query('UPDATE authors SET name = ?, bio = ?, avatar = ? WHERE id = ?', [profile.name, profile.bio, profile.avatar, id]);
      return { id, ...profile };
    },
    async resolve(input, existing) {
      if (input.author_profile_id !== undefined) {
        const id = validAuthorId(input.author_profile_id);
        const author = await this.get(id);
        if (!author) throw new Error('Author profile not found');
        return { author_profile_id: author.id, author_name: author.name };
      }
      // Preserve compatibility with editors that still send a free-text byline.
      if (existing?.author_profile_id && (input.author_name === undefined || input.author_name === existing.author_name)) {
        return { author_profile_id: existing.author_profile_id, author_name: existing.author_name };
      }
      const { name } = validateAuthor({ name: input.author_name ?? existing?.author_name ?? 'Admin' });
      await db.query("INSERT INTO authors (name, bio, avatar) VALUES (?, '', '') ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)", [name]);
      const [rows] = await db.query('SELECT id, name FROM authors WHERE name = ?', [name]);
      return { author_profile_id: rows[0].id, author_name: rows[0].name };
    }
  };
}
export default createAuthorStore();
