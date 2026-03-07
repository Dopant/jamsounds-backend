import express from 'express';
import { subscribe, unsubscribe, getSubscribers, addCampaign, getCampaigns, sendNewsletterToAll } from '../models/newsletter.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Public: Subscribe
router.post('/subscribe', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email required' });
  await subscribe(email);
  res.json({ message: 'Subscribed successfully' });
});

// Public: Unsubscribe
router.post('/unsubscribe', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email required' });
  await unsubscribe(email);
  res.json({ message: 'Unsubscribed successfully' });
});

// Admin: List subscribers
router.get('/subscribers', authenticateToken, async (req, res) => {
  const subs = await getSubscribers();
  res.json(subs);
});

// Admin: Send newsletter (record campaign)
router.post('/send', authenticateToken, async (req, res) => {
  const { subject, content, post_id } = req.body;
  if (!subject || !content) return res.status(400).json({ message: 'Subject and content required' });
  const id = await addCampaign({ subject, content, post_id });
  // Send emails to all subscribers
  const result = await sendNewsletterToAll({ subject, html: content });
  res.json({ message: 'Newsletter sent', campaignId: id, sent: result.sent });
});

// Admin: Get campaigns
router.get('/campaigns', authenticateToken, async (req, res) => {
  const campaigns = await getCampaigns();
  res.json(campaigns);
});

export default router; 