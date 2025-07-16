import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { getAllPosts, getVisitStats } from '../models/blogPost.js';

const router = express.Router();

// GET /api/analytics - Admin analytics metrics
router.get('/', authenticateToken, async (req, res) => {
  try {
    // Fetch all posts
    const posts = await getAllPosts({});

    // Total Rating (sum and average)
    const totalRating = posts.reduce((sum, post) => sum + (post.rating || 0), 0);
    const avgRating = posts.length > 0 ? totalRating / posts.length : 0;

    // Total Views
    const totalViews = posts.reduce((sum, post) => sum + (post.views || 0), 0);

    // Top Content by Views
    const topByViews = [...posts]
      .sort((a, b) => (b.views || 0) - (a.views || 0))
      .slice(0, 5)
      .map(post => ({
        id: post.id,
        title: post.title,
        views: post.views || 0,
        rating: post.rating || 0
      }));

    // Top Content by Rating
    const topByRating = [...posts]
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .slice(0, 5)
      .map(post => ({
        id: post.id,
        title: post.title,
        views: post.views || 0,
        rating: post.rating || 0
      }));

    // Get visit stats for global distribution and device breakdown
    const { byCountry, byDevice } = await getVisitStats();
    const globalDistribution = byCountry;
    const deviceBreakdown = byDevice;

    res.json({
      totalRating,
      avgRating,
      totalViews,
      topByViews,
      topByRating,
      globalDistribution,
      deviceBreakdown
    });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ message: 'Failed to fetch analytics' });
  }
});

export default router; 