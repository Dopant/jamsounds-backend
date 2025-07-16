import express from 'express';
import { findAdminByEmail, updateAdminProfile, getSetting, setSetting } from '../models/admin.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

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

export default router; 