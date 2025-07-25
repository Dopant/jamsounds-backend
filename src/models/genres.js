import pool from '../db.js';

export async function getAllGenres() {
  const [rows] = await pool.query('SELECT * FROM genres ORDER BY name ASC');
  return rows;
}

export async function getGenreById(id) {
  const [rows] = await pool.query('SELECT * FROM genres WHERE id = ?', [id]);
  return rows[0];
}

export async function createGenre(name) {
  const [result] = await pool.query('INSERT INTO genres (name) VALUES (?)', [name]);
  return result.insertId;
}

export async function updateGenre(id, name) {
  const [result] = await pool.query('UPDATE genres SET name = ? WHERE id = ?', [name, id]);
  return result.affectedRows;
}

export async function deleteGenre(id) {
  const [result] = await pool.query('DELETE FROM genres WHERE id = ?', [id]);
  return result.affectedRows;
} 