import express from 'express';
import { findAdminByEmail, updateAdminProfile, getSetting, setSetting, getHomepageStats, setHomepageStats, getHomepageContent, setHomepageContent, getSocialLinks, setSocialLinks } from '../models/admin.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import pool from '../db.js';

const uploadDir = path.resolve('uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-admin-avatar' + ext);
  }
});
const upload = multer({ storage });

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password required' });
  }
  const admin = await findAdminByEmail(email);
  if (!admin) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  const valid = await bcrypt.compare(password, admin.password_hash);
  if (!valid) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  const token = jwt.sign({ id: admin.id, email: admin.email }, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, admin: { id: admin.id, email: admin.email, name: admin.name } });
});

// Update admin profile (name, bio, avatar)
router.put('/profile', authenticateToken, upload.single('avatar'), async (req, res) => {
  const adminId = req.user.id;
  const { name, bio } = req.body;
  let avatar = req.body.avatar;
  if (req.file) {
    avatar = '/uploads/' + req.file.filename;
  }
  const updated = await updateAdminProfile(adminId, { name, bio, avatar });
  if (!updated) return res.status(400).json({ message: 'Failed to update profile' });
  res.json({ name, bio, avatar });
});

// Get current admin profile
router.get('/me', authenticateToken, async (req, res) => {
  const admin = await findAdminByEmail(req.user.email);
  if (!admin) return res.status(404).json({ message: 'Admin not found' });
  res.json({
    id: admin.id,
    name: admin.name,
    email: admin.email,
    bio: admin.bio,
    avatar: admin.avatar
  });
});

// Change admin password
router.put('/change-password', authenticateToken, async (req, res) => {
  const adminId = req.user.id;
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ message: 'Old and new password required' });
  }
  const admin = await findAdminByEmail(req.user.email);
  if (!admin) return res.status(404).json({ message: 'Admin not found' });
  const valid = await bcrypt.compare(oldPassword, admin.password_hash);
  if (!valid) return res.status(401).json({ message: 'Old password is incorrect' });
  if (newPassword.length < 8) return res.status(400).json({ message: 'New password must be at least 8 characters' });
  const newHash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE admin SET password_hash = ? WHERE id = ?', [newHash, adminId]);
  res.json({ message: 'Password updated successfully' });
});

// Get submit redirect URL (public)
router.get('/settings/submit-redirect-url', async (req, res) => {
  const url = await getSetting('submit_redirect_url');
  res.json({ url });
});

// Update submit redirect URL (admin only)
router.put('/settings/submit-redirect-url', authenticateToken, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ message: 'Missing url' });
  await setSetting('submit_redirect_url', url);
  res.json({ url });
});

// Public: Get homepage statistics
router.get('/homepage-stats', async (req, res) => {
  try {
    const stats = await getHomepageStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch homepage stats' });
  }
});

// Admin: Update homepage statistics
router.put('/homepage-stats', authenticateToken, async (req, res) => {
  try {
    await setHomepageStats(req.body);
    res.json({ message: 'Homepage stats updated' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update homepage stats' });
  }
});

// Get homepage content (public)
router.get('/settings/homepage-content', async (req, res) => {
  try {
    const content = await getHomepageContent();
    res.json(content);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch homepage content' });
  }
});

// Update homepage content (admin only)
router.put('/settings/homepage-content', authenticateToken, upload.single('logo'), async (req, res) => {
  try {
    const { homepage_title, homepage_subtitle, homepage_description } = req.body;
    let homepage_logo_url = req.body.homepage_logo_url;
    if (req.file) {
      homepage_logo_url = '/uploads/' + req.file.filename;
    }
    await setHomepageContent({ homepage_title, homepage_subtitle, homepage_description, homepage_logo_url });
    res.json({ message: 'Homepage content updated' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update homepage content' });
  }
});

// Get social links (public)
router.get('/settings/social-links', async (req, res) => {
  try {
    const links = await getSocialLinks();
    res.json(links);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch social links' });
  }
});

// Update social links (admin only)
router.put('/settings/social-links', authenticateToken, async (req, res) => {
  try {
    await setSocialLinks(req.body);
    res.json({ message: 'Social links updated' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update social links' });
  }
});

export default router; 