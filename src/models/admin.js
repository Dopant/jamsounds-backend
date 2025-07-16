import pool from '../db.js';
import bcrypt from 'bcrypt';

export async function findAdminByEmail(email) {
  const [rows] = await pool.query('SELECT * FROM admin WHERE email = ?', [email]);
  return rows[0];
}

export async function createAdmin({ email, password, name }) {
  const password_hash = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    'INSERT INTO admin (email, password_hash, name) VALUES (?, ?, ?)',
    [email, password_hash, name]
  );
  return result.insertId;
}

export async function updateAdminProfile(id, { name, bio, avatar }) {
  const [result] = await pool.query(
    'UPDATE admin SET name = ?, bio = ?, avatar = ? WHERE id = ?',
    [name, bio, avatar, id]
  );
  return result.affectedRows;
}

export async function getSetting(key) {
  const [rows] = await pool.query('SELECT value FROM settings WHERE key_name = ?', [key]);
  return rows[0]?.value || null;
}

export async function setSetting(key, value) {
  // Insert or update
  await pool.query(
    'INSERT INTO settings (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
    [key, value]
  );
}

// Homepage statistics keys
const HOMEPAGE_STATS_KEYS = [
  'artists_featured_count',
  'reviews_published_count',
  'monthly_readers_count'
];

export async function getHomepageStats() {
  const stats = {};
  for (const key of HOMEPAGE_STATS_KEYS) {
    stats[key] = await getSetting(key);
  }
  return stats;
}

export async function setHomepageStats(newStats) {
  for (const key of HOMEPAGE_STATS_KEYS) {
    if (key in newStats && newStats[key] != null && newStats[key] !== '') {
      console.log(`[HomepageStats] Updating ${key} to:`, newStats[key]);
      await setSetting(key, newStats[key]);
    }
  }
}

// Homepage content keys
const HOMEPAGE_CONTENT_KEYS = [
  'homepage_title',
  'homepage_subtitle',
  'homepage_description',
  'homepage_logo_url'
];

export async function getHomepageContent() {
  const content = {};
  for (const key of HOMEPAGE_CONTENT_KEYS) {
    content[key] = await getSetting(key);
  }
  return content;
}

export async function setHomepageContent(newContent) {
  for (const key of HOMEPAGE_CONTENT_KEYS) {
    if (key in newContent && newContent[key] != null && newContent[key] !== '') {
      console.log(`[HomepageContent] Updating ${key} to:`, newContent[key]);
      await setSetting(key, newContent[key]);
    }
  }
}

// Social media links keys
const SOCIAL_LINKS_KEYS = [
  'social_x_url',
  'social_facebook_url',
  'social_instagram_url',
  'social_youtube_url'
];

export async function getSocialLinks() {
  const links = {};
  for (const key of SOCIAL_LINKS_KEYS) {
    links[key] = await getSetting(key);
  }
  return links;
}

export async function setSocialLinks(newLinks) {
  for (const key of SOCIAL_LINKS_KEYS) {
    if (key in newLinks && newLinks[key] != null && newLinks[key] !== '') {
      await setSetting(key, newLinks[key]);
    }
  }
}

export async function seedInitialAdmin() {
  const email = 'admin@musicblog.com';
  const password = 'MusicBlog2025!';
  const name = 'Admin';
  const existing = await findAdminByEmail(email);
  if (!existing) {
    await createAdmin({ email, password, name });
    console.log('Seeded initial admin user:', email);
  } else {
    console.log('Admin user already exists:', email);
  }
} 