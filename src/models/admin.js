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