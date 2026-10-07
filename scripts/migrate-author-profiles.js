import pool from '../src/db.js';
import { pathToFileURL } from 'node:url';

// Run before deploying the new backend. Safe to rerun; never overwrites existing bios.
export async function migrate(db = pool, args = process.argv.slice(2)) {
  await db.query(`CREATE TABLE IF NOT EXISTS authors (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(191) NOT NULL,
    bio TEXT NOT NULL,
    avatar VARCHAR(2048) NOT NULL DEFAULT '',
    UNIQUE KEY uq_authors_name (name)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const [columns] = await db.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'blog_posts' AND COLUMN_NAME = 'author_profile_id'");
  if (!columns.length) await db.query('ALTER TABLE blog_posts ADD COLUMN author_profile_id INT NULL, ADD INDEX idx_posts_author_profile (author_profile_id), ADD CONSTRAINT fk_posts_author_profile FOREIGN KEY (author_profile_id) REFERENCES authors(id)');
  await db.query(`INSERT INTO authors (name, bio, avatar)
    SELECT DISTINCT COALESCE(NULLIF(TRIM(author_name), ''), 'Admin'), '', '' FROM blog_posts
    ON DUPLICATE KEY UPDATE name = authors.name`);
  await db.query(`UPDATE blog_posts p JOIN authors a ON a.name COLLATE utf8mb4_unicode_ci = CONVERT(COALESCE(NULLIF(TRIM(p.author_name), ''), 'Admin') USING utf8mb4) COLLATE utf8mb4_unicode_ci
    SET p.author_profile_id = a.id WHERE p.author_profile_id IS NULL`);
  // Do not give every byline the account owner's bio. Copy only a matching name.
  await db.query(`UPDATE authors a JOIN admin u ON CONVERT(TRIM(u.name) USING utf8mb4) COLLATE utf8mb4_unicode_ci = a.name COLLATE utf8mb4_unicode_ci
    SET a.bio = COALESCE(u.bio, ''), a.avatar = COALESCE(u.avatar, '')
    WHERE a.bio = '' AND COALESCE(u.bio, '') <> ''`);
  const position = args.indexOf('--legacy-bio-author');
  if (position !== -1) {
    const name = args[position + 1];
    if (!name || name.startsWith('--')) throw new Error('Supply a name after --legacy-bio-author');
    const [profiles] = await db.query('SELECT id, bio FROM authors WHERE name = ?', [name]);
    if (!profiles.length) throw new Error('Legacy bio author not found among existing bylines');
    const [bios] = await db.query(`SELECT DISTINCT u.bio FROM blog_posts p JOIN admin u ON u.id = p.author_id
      WHERE CONVERT(TRIM(p.author_name) USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci AND COALESCE(u.bio, '') <> ''`, [name]);
    if (bios.length !== 1) throw new Error('No unambiguous legacy bio found. Enter this author bio through the editor.');
    if (!profiles[0].bio) await db.query('UPDATE authors SET bio = ? WHERE id = ? AND bio = ?', [bios[0].bio, profiles[0].id, '']);
  }
  console.log('Author profiles migrated. Review blank bios in the article editor.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await migrate(); } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { await pool.end(); }
}
