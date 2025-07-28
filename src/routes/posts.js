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
import pool from '../db.js'; // Added for schema test
import { processHeroImage, processAuthorImage } from '../utils/imageProcessor.js';

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
const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for better quality
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Update multer to handle heroImage, authorImage, and multiple mediaFiles
const uploadMedia = upload.fields([
  { name: 'heroImage', maxCount: 1 },
  { name: 'authorImage', maxCount: 1 },
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
  try {
    // Debug: Log the files received
    console.log('Files received:', req.files ? Object.keys(req.files) : 'No files');
    if (req.files) {
      Object.keys(req.files).forEach(fieldName => {
        console.log(`Field ${fieldName}:`, req.files[fieldName].length, 'files');
      });
    }
    // Validate required fields
    const { title, excerpt, content, tags, featured, rating, read_time, priority, categories, created_at, genre_id, author_name } = req.body;
    
    if (!title || !content) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        required: ['title', 'content'],
        received: { title: !!title, content: !!content }
      });
    }

    const author_id = req.user.id;
    let hero_image_url = null;
    let author_image = null;
    
    // Validate and process hero image
    if (req.files && req.files['heroImage'] && req.files['heroImage'][0]) {
      const heroFile = req.files['heroImage'][0];
      // Validate file type
      if (!heroFile.mimetype.startsWith('image/')) {
        return res.status(400).json({ 
          error: 'Hero image must be an image file',
          received: heroFile.mimetype 
        });
      }
      // Validate file size (10MB limit for better quality)
      if (heroFile.size > 10 * 1024 * 1024) {
        return res.status(400).json({ 
          error: 'Hero image size must be less than 10MB',
          received: `${(heroFile.size / 1024 / 1024).toFixed(2)}MB`
        });
      }
      
      // Use original hero image for now (processing disabled)
      hero_image_url = '/uploads/' + heroFile.filename;
    }
    
    // Validate and process author image
    if (req.files && req.files['authorImage'] && req.files['authorImage'][0]) {
      const authorFile = req.files['authorImage'][0];
      // Validate file type
      if (!authorFile.mimetype.startsWith('image/')) {
        return res.status(400).json({ 
          error: 'Author image must be an image file',
          received: authorFile.mimetype 
        });
      }
      // Validate file size (5MB limit for author images)
      if (authorFile.size > 5 * 1024 * 1024) {
        return res.status(400).json({ 
          error: 'Author image size must be less than 5MB',
          received: `${(authorFile.size / 1024 / 1024).toFixed(2)}MB`
        });
      }
      
      // Use original author image for now (processing disabled)
      author_image = '/uploads/' + authorFile.filename;
    }
  
    // Create the post with validation
    const postId = await createPost({
      title,
      excerpt,
      content,
      author_id,
      author_name: author_name || 'Admin',
      author_image,
      tags,
      featured: featured === 'true' || featured === true,
      priority: priority ? parseInt(priority, 10) : 0,
      hero_image_url,
      rating,
      read_time,
      created_at, // pass through, may be undefined
      genre_id: genre_id ? parseInt(genre_id, 10) : null
    });

    if (!postId) {
      return res.status(500).json({ 
        error: 'Failed to create post',
        details: 'Database operation failed'
      });
    }

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

    // Return success with post details
    res.status(201).json({ 
      id: postId,
      message: 'Post created successfully',
      post: {
        title,
        author_name: author_name || 'Admin',
        author_image,
        hero_image_url,
        featured: featured === 'true' || featured === true
      }
    });

  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to create post',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
    });
  }
});

// Admin: Update post (accept categories)
router.put('/:id', authenticateToken, upload.fields([
  { name: 'heroImage', maxCount: 1 },
  { name: 'authorImage', maxCount: 1 }
]), async (req, res) => {
  try {
    // Debug: Log the files received
    console.log('PUT - Files received:', req.files ? Object.keys(req.files) : 'No files');
    if (req.files) {
      Object.keys(req.files).forEach(fieldName => {
        console.log(`PUT - Field ${fieldName}:`, req.files[fieldName].length, 'files');
      });
    }
    
    // Fetch the existing post first
    const existing = await getPostById(req.params.id);
  if (!existing) return res.status(404).json({ message: 'Post not found' });

  // Use new value if provided, otherwise keep existing
  const title = req.body.title !== undefined ? req.body.title : existing.title;
  const excerpt = req.body.excerpt !== undefined ? req.body.excerpt : existing.excerpt;
  const content = req.body.content !== undefined ? req.body.content : existing.content;
  const author_name = req.body.author_name !== undefined ? req.body.author_name : existing.author_name;
  const tags = req.body.tags !== undefined ? req.body.tags : existing.tags;
  const featured = req.body.featured !== undefined ? (req.body.featured === 'true' || req.body.featured === true) : existing.featured;
  const priority = req.body.priority !== undefined ? (req.body.priority ? parseInt(req.body.priority, 10) : 0) : existing.priority;
  let hero_image_url = existing.hero_image_url;
  let author_image = existing.author_image;
  
  if (req.files && req.files['heroImage'] && req.files['heroImage'][0]) {
    // Use original hero image for now (processing disabled)
    hero_image_url = '/uploads/' + req.files['heroImage'][0].filename;
  }
  
  if (req.files && req.files['authorImage'] && req.files['authorImage'][0]) {
    // Use original author image for now (processing disabled)
    author_image = '/uploads/' + req.files['authorImage'][0].filename;
  }
  const rating = req.body.rating !== undefined ? req.body.rating : existing.rating;
  const read_time = req.body.read_time !== undefined ? req.body.read_time : existing.read_time;
  const { categories, created_at, genre_id } = req.body;

  const updated = await updatePost(req.params.id, {
    title,
    excerpt,
    content,
    author_name,
    author_image,
    tags,
    featured,
    priority,
    hero_image_url,
    rating,
    read_time,
    created_at, // pass through, may be undefined
    genre_id: genre_id ? parseInt(genre_id, 10) : existing.genre_id
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
  } catch (error) {
    console.error('Error updating post:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to update post',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
    });
  }
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

// Test endpoint to verify database schema
router.get('/test/schema', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query('DESCRIBE blog_posts');
    const columns = rows.map(row => ({
      field: row.Field,
      type: row.Type,
      null: row.Null,
      key: row.Key,
      default: row.Default,
      extra: row.Extra
    }));
    
    const authorImageColumn = columns.find(col => col.field === 'author_image');
    
    res.json({
      success: true,
      message: 'Database schema check completed',
      hasAuthorImageColumn: !!authorImageColumn,
      authorImageColumn: authorImageColumn,
      allColumns: columns
    });
  } catch (error) {
    console.error('Schema check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check database schema',
      details: error.message
    });
  }
});

// Test endpoint to verify multer configuration
router.post('/test/upload', authenticateToken, uploadMedia, async (req, res) => {
  try {
    console.log('Test upload - Files received:', req.files ? Object.keys(req.files) : 'No files');
    if (req.files) {
      Object.keys(req.files).forEach(fieldName => {
        console.log(`Test upload - Field ${fieldName}:`, req.files[fieldName].length, 'files');
        req.files[fieldName].forEach((file, index) => {
          console.log(`  File ${index}:`, {
            originalname: file.originalname,
            filename: file.filename,
            mimetype: file.mimetype,
            size: file.size
          });
        });
      });
    }
    
    res.json({
      success: true,
      message: 'Upload test successful',
      files: req.files ? Object.keys(req.files) : [],
      body: req.body
    });
  } catch (error) {
    console.error('Upload test error:', error);
    res.status(500).json({
      success: false,
      error: 'Upload test failed',
      details: error.message
    });
  }
});

export default router; 