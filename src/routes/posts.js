import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  getAllPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost,
  getMediaByPostId,
  addMediaToPost,
  deleteMedia,
  updatePostPriority,
  deleteAllMediaForPost,
  incrementPostViews,
  incrementPostRating,
  getCategoriesByPostId,
  setCategoriesForPost,
  getPostsByCategory,
  logVisit
} from '../models/blogPost.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// File upload setup
const uploadDir = path.resolve('uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + file.fieldname + ext);
  }
});
const upload = multer({ storage });

// Update multer to handle both single heroImage and multiple mediaFiles
const uploadMedia = upload.fields([
  { name: 'heroImage', maxCount: 1 },
  { name: 'mediaFiles', maxCount: 10 }
]);

// Public: Get all posts (with category filter)
router.get('/', async (req, res) => {
  // Log visit
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';
  await logVisit({ ip, userAgent });
  const { search, genre, featured, sortBy, limit, offset, category } = req.query;
  let posts;
  if (category) {
    posts = await getPostsByCategory(category, limit ? parseInt(limit, 10) : 10);
  } else {
    posts = await getAllPosts({ search, genre, featured, sortBy, limit, offset });
  }
  // Map author fields into an author object for each post
  const postsWithAuthor = await Promise.all(posts.map(async post => ({
    ...post,
    author: {
      name: post.author_name || 'Admin',
      avatar: post.author_avatar || '',
      bio: post.author_bio || ''
    },
    categories: await getCategoriesByPostId(post.id)
  })));
  res.json(postsWithAuthor);
});

// Public: Get single post (include categories)
router.get('/:id', async (req, res) => {
  // Log visit
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';
  await logVisit({ ip, userAgent });
  await incrementPostViews(req.params.id);
  const post = await getPostById(req.params.id);
  if (!post) return res.status(404).json({ message: 'Post not found' });
  const media = await getMediaByPostId(post.id);
  const categories = await getCategoriesByPostId(post.id);
  // Map author fields into an author object
  const postWithAuthor = {
    ...post,
    author: {
      name: post.author_name || 'Admin',
      avatar: post.author_avatar || '',
      bio: post.author_bio || ''
    },
    media,
    categories
  };
  res.json(postWithAuthor);
});

// Public: Rate post (increment rating)
router.post('/:id/rate', async (req, res) => {
  const updated = await incrementPostRating(req.params.id);
  if (!updated) return res.status(404).json({ message: 'Post not found' });
  res.json({ message: 'Rating incremented' });
});

// Admin: Create post (accept categories)
router.post('/', authenticateToken, uploadMedia, async (req, res) => {
  const { title, excerpt, content, genre, tags, featured, rating, read_time, priority, categories } = req.body;
  const author_id = req.user.id;
  let hero_image_url = null;
  if (req.files && req.files['heroImage'] && req.files['heroImage'][0]) {
    hero_image_url = '/uploads/' + req.files['heroImage'][0].filename;
  }
  const postId = await createPost({
    title,
    excerpt,
    content,
    author_id,
    genre,
    tags,
    featured: featured === 'true' || featured === true,
    priority: priority ? parseInt(priority, 10) : 0,
    hero_image_url,
    rating,
    read_time
  });
  // Set categories
  let cats = categories;
  if (typeof cats === 'string') cats = cats.split(',').map(c => c.trim()).filter(Boolean);
  await setCategoriesForPost(postId, cats);

  // Handle local media uploads (audio/video)
  if (req.files && req.files['mediaFiles']) {
    // mediaTypes, mediaTitles, mediaArtists are parallel arrays
    const types = Array.isArray(req.body.mediaTypes) ? req.body.mediaTypes : [req.body.mediaTypes];
    const titles = Array.isArray(req.body.mediaTitles) ? req.body.mediaTitles : [req.body.mediaTitles];
    const artists = Array.isArray(req.body.mediaArtists) ? req.body.mediaArtists : [req.body.mediaArtists];
    req.files['mediaFiles'].forEach((file, idx) => {
      addMediaToPost(postId, {
        type: 'local',
        media_type: types[idx] || 'audio',
        platform: '',
        url: '',
        file_url: '/uploads/' + file.filename,
        title: titles[idx] || '',
        artist: artists[idx] || ''
      });
    });
  }

  // Handle external media links
  // These may be arrays or single values depending on the number of items
  const {
    externalMediaUrls,
    externalMediaTypes,
    externalMediaPlatforms,
    externalMediaTitles,
    externalMediaArtists
  } = req.body;
  if (externalMediaUrls) {
    // Normalize to arrays
    const urls = Array.isArray(externalMediaUrls) ? externalMediaUrls : [externalMediaUrls];
    const types = Array.isArray(externalMediaTypes) ? externalMediaTypes : [externalMediaTypes];
    const platforms = Array.isArray(externalMediaPlatforms) ? externalMediaPlatforms : [externalMediaPlatforms];
    const titles = Array.isArray(externalMediaTitles) ? externalMediaTitles : [externalMediaTitles];
    const artists = Array.isArray(externalMediaArtists) ? externalMediaArtists : [externalMediaArtists];
    for (let i = 0; i < urls.length; i++) {
      await addMediaToPost(postId, {
        type: 'external',
        media_type: types[i] || 'audio',
        platform: platforms[i] || '',
        url: urls[i],
        file_url: null,
        title: titles[i] || '',
        artist: artists[i] || ''
      });
    }
  }

  res.status(201).json({ id: postId });
});

// Admin: Update post (accept categories)
router.put('/:id', authenticateToken, upload.single('heroImage'), async (req, res) => {
  // Fetch the existing post first
  const existing = await getPostById(req.params.id);
  if (!existing) return res.status(404).json({ message: 'Post not found' });

  // Use new value if provided, otherwise keep existing
  const title = req.body.title !== undefined ? req.body.title : existing.title;
  const excerpt = req.body.excerpt !== undefined ? req.body.excerpt : existing.excerpt;
  const content = req.body.content !== undefined ? req.body.content : existing.content;
  const genre = req.body.genre !== undefined ? req.body.genre : existing.genre;
  const tags = req.body.tags !== undefined ? req.body.tags : existing.tags;
  const featured = req.body.featured !== undefined ? (req.body.featured === 'true' || req.body.featured === true) : existing.featured;
  const priority = req.body.priority !== undefined ? (req.body.priority ? parseInt(req.body.priority, 10) : 0) : existing.priority;
  let hero_image_url = existing.hero_image_url;
  if (req.file) {
    hero_image_url = '/uploads/' + req.file.filename;
  }
  const rating = req.body.rating !== undefined ? req.body.rating : existing.rating;
  const read_time = req.body.read_time !== undefined ? req.body.read_time : existing.read_time;
  const { categories } = req.body;

  const updated = await updatePost(req.params.id, {
    title,
    excerpt,
    content,
    genre,
    tags,
    featured,
    priority,
    hero_image_url,
    rating,
    read_time
  });
  if (!updated) return res.status(404).json({ message: 'Post not found' });

  // Set categories
  let cats = categories;
  if (typeof cats === 'string') cats = cats.split(',').map(c => c.trim()).filter(Boolean);
  await setCategoriesForPost(req.params.id, cats);

  // Delete all existing media for this post before adding new ones
  await deleteAllMediaForPost(req.params.id);

  // Handle external media links (optional: clear and re-add for update)
  const {
    externalMediaUrls,
    externalMediaTypes,
    externalMediaPlatforms,
    externalMediaTitles,
    externalMediaArtists
  } = req.body;
  if (externalMediaUrls) {
    const urls = Array.isArray(externalMediaUrls) ? externalMediaUrls : [externalMediaUrls];
    const types = Array.isArray(externalMediaTypes) ? externalMediaTypes : [externalMediaTypes];
    const platforms = Array.isArray(externalMediaPlatforms) ? externalMediaPlatforms : [externalMediaPlatforms];
    const titles = Array.isArray(externalMediaTitles) ? externalMediaTitles : [externalMediaTitles];
    const artists = Array.isArray(externalMediaArtists) ? externalMediaArtists : [externalMediaArtists];
    for (let i = 0; i < urls.length; i++) {
      await addMediaToPost(req.params.id, {
        type: 'external',
        media_type: types[i] || 'audio',
        platform: platforms[i] || '',
        url: urls[i],
        file_url: null,
        title: titles[i] || '',
        artist: artists[i] || ''
      });
    }
  }

  // Fetch and return the updated post (with media and author)
  const post = await getPostById(req.params.id);
  const media = await getMediaByPostId(req.params.id);
  const cats2 = await getCategoriesByPostId(req.params.id);
  const postWithAuthor = {
    ...post,
    author: {
      name: post.author_name || 'Admin',
      avatar: post.author_avatar || '',
      bio: post.author_bio || ''
    },
    media,
    categories: cats2
  };
  res.json(postWithAuthor);
});

// Admin: Update only priority
router.patch('/:id/priority', authenticateToken, async (req, res) => {
  const { priority } = req.body;
  if (typeof priority === 'undefined') return res.status(400).json({ message: 'Missing priority' });
  const updated = await updatePostPriority(req.params.id, priority);
  if (!updated) return res.status(404).json({ message: 'Post not found' });
  res.json({ message: 'Priority updated' });
});

// Admin: Delete post
router.delete('/:id', authenticateToken, async (req, res) => {
  const deleted = await deletePost(req.params.id);
  if (!deleted) return res.status(404).json({ message: 'Post not found' });
  res.json({ message: 'Post deleted' });
});

// Admin: Add media to post
router.post('/:id/media', authenticateToken, upload.single('file'), async (req, res) => {
  const { type, media_type, platform, url, title, artist } = req.body;
  let file_url = null;
  if (req.file) {
    file_url = '/uploads/' + req.file.filename;
  }
  const mediaId = await addMediaToPost(req.params.id, {
    type,
    media_type,
    platform,
    url,
    file_url,
    title,
    artist
  });
  res.status(201).json({ id: mediaId });
});

// Admin: Delete media
router.delete('/media/:mediaId', authenticateToken, async (req, res) => {
  const deleted = await deleteMedia(req.params.mediaId);
  if (!deleted) return res.status(404).json({ message: 'Media not found' });
  res.json({ message: 'Media deleted' });
});

export default router; 