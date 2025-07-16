import pool from '../db.js';
import geoip from 'geoip-lite';
import { UAParser } from 'ua-parser-js';

export async function getAllPosts({ search, genre, featured, sortBy, limit, offset }) {
  let query = `SELECT p.*, a.name AS author_name, a.avatar AS author_avatar, a.bio AS author_bio
    FROM blog_posts p
    LEFT JOIN admin a ON p.author_id = a.id
    WHERE 1=1`;
  const params = [];
  if (search) {
    query += ' AND (p.title LIKE ? OR p.excerpt LIKE ? OR p.content LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (genre) {
    query += ' AND p.genre = ?';
    params.push(genre);
  }
  if (featured !== undefined) {
    query += ' AND p.featured = ?';
    params.push(featured);
  }
  if (sortBy === 'priority') {
    query += ' ORDER BY p.priority DESC, p.created_at DESC';
  } else if (sortBy === 'latest') {
    query += ' ORDER BY p.created_at DESC';
  } else if (sortBy === 'popular') {
    query += ' ORDER BY p.views DESC';
  } else if (sortBy === 'rating') {
    query += ' ORDER BY p.rating DESC';
  } else {
    query += ' ORDER BY p.created_at DESC';
  }
  if (limit) {
    query += ' LIMIT ?';
    params.push(Number(limit));
  }
  if (offset) {
    query += ' OFFSET ?';
    params.push(Number(offset));
  }
  console.log('getAllPosts SQL:', query);
  console.log('getAllPosts params:', params);
  const [rows] = await pool.query(query, params);
  return rows;
}

export async function getPostById(id) {
  const [rows] = await pool.query(
    `SELECT p.*, a.name AS author_name, a.avatar AS author_avatar, a.bio AS author_bio
     FROM blog_posts p
     LEFT JOIN admin a ON p.author_id = a.id
     WHERE p.id = ?`,
    [id]
  );
  return rows[0];
}

export async function createPost(post) {
  const [result] = await pool.query(
    'INSERT INTO blog_posts (title, excerpt, content, author_id, genre, tags, featured, priority, hero_image_url, created_at, updated_at, views, rating, read_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), 0, ?, ?)',
    [post.title, post.excerpt, post.content, post.author_id, post.genre, post.tags, post.featured, post.priority || 0, post.hero_image_url, post.rating, post.read_time]
  );
  return result.insertId;
}

export async function updatePost(id, post) {
  const [result] = await pool.query(
    'UPDATE blog_posts SET title=?, excerpt=?, content=?, genre=?, tags=?, featured=?, priority=?, hero_image_url=?, updated_at=NOW(), rating=?, read_time=? WHERE id=?',
    [post.title, post.excerpt, post.content, post.genre, post.tags, post.featured, post.priority || 0, post.hero_image_url, post.rating, post.read_time, id]
  );
  return result.affectedRows;
}

export async function deletePost(id) {
  const [result] = await pool.query('DELETE FROM blog_posts WHERE id = ?', [id]);
  return result.affectedRows;
}

export async function getMediaByPostId(post_id) {
  const [rows] = await pool.query('SELECT * FROM blog_post_media WHERE post_id = ?', [post_id]);
  return rows;
}

export async function addMediaToPost(post_id, media) {
  const [result] = await pool.query(
    'INSERT INTO blog_post_media (post_id, type, media_type, platform, url, file_url, title, artist) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [post_id, media.type, media.media_type, media.platform, media.url, media.file_url, media.title, media.artist]
  );
  return result.insertId;
}

export async function deleteMedia(id) {
  const [result] = await pool.query('DELETE FROM blog_post_media WHERE id = ?', [id]);
  return result.affectedRows;
}

export async function updatePostPriority(id, priority) {
  const [result] = await pool.query(
    'UPDATE blog_posts SET priority=? WHERE id=?',
    [priority, id]
  );
  return result.affectedRows;
}

export async function deleteAllMediaForPost(post_id) {
  const [result] = await pool.query('DELETE FROM blog_post_media WHERE post_id = ?', [post_id]);
  return result.affectedRows;
}

export async function incrementPostViews(id) {
  const [result] = await pool.query('UPDATE blog_posts SET views = views + 1 WHERE id = ?', [id]);
  return result.affectedRows;
}

export async function incrementPostRating(id) {
  const [result] = await pool.query('UPDATE blog_posts SET rating = IFNULL(rating,0) + 1 WHERE id = ?', [id]);
  return result.affectedRows;
}

export async function getCategoriesByPostId(post_id) {
  const [rows] = await pool.query('SELECT category FROM post_categories WHERE post_id = ?', [post_id]);
  return rows.map(r => r.category);
}

export async function setCategoriesForPost(post_id, categories) {
  // Remove all existing categories
  await pool.query('DELETE FROM post_categories WHERE post_id = ?', [post_id]);
  if (Array.isArray(categories) && categories.length > 0) {
    const values = categories.map(cat => [post_id, cat]);
    await pool.query('INSERT INTO post_categories (post_id, category) VALUES ?', [values]);
  }
}

export async function getPostsByCategory(category, limit = 10) {
  const [rows] = await pool.query(
    `SELECT p.*, a.name AS author_name, a.avatar AS author_avatar, a.bio AS author_bio
     FROM blog_posts p
     LEFT JOIN admin a ON p.author_id = a.id
     JOIN post_categories pc ON p.id = pc.post_id
     WHERE pc.category = ?
     ORDER BY p.created_at DESC
     LIMIT ?`,
    [category, limit]
  );
  return rows;
}

// Log a visit with IP and user-agent
export async function logVisit({ ip, userAgent }) {
  await pool.query(
    'INSERT INTO visits (ip, user_agent, visited_at) VALUES (?, ?, NOW())',
    [ip, userAgent]
  );
}

// Get aggregated visit stats for analytics
export async function getVisitStats() {
  // Get all visits
  const [visits] = await pool.query('SELECT ip, user_agent FROM visits');

  // Country count
  const countryCounts = {};
  for (const visit of visits) {
    let country = 'Unknown';
    if (visit.ip && visit.ip !== '::1' && visit.ip !== '127.0.0.1') {
      const geo = geoip.lookup(visit.ip);
      if (geo && geo.country) country = geo.country;
    }
    countryCounts[country] = (countryCounts[country] || 0) + 1;
  }

  // Device type count
  const deviceCounts = { Desktop: 0, Mobile: 0, Tablet: 0 };
  for (const visit of visits) {
    const parser = new UAParser(visit.user_agent);
    const type = parser.getDevice().type;
    if (type === 'mobile') deviceCounts.Mobile++;
    else if (type === 'tablet') deviceCounts.Tablet++;
    else deviceCounts.Desktop++;
  }

  // Format for frontend
  const byCountry = Object.entries(countryCounts)
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const byDevice = Object.entries(deviceCounts)
    .map(([device, count]) => ({ device, count }));

  return { byCountry, byDevice };
} 