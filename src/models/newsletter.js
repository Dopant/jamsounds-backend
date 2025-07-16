import pool from '../db.js';
import nodemailer from 'nodemailer';

// Configure Nodemailer with Gmail SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  }
});

export async function subscribe(email) {
  // Insert or update status to active
  await pool.query(
    `INSERT INTO newsletter_subscribers (email, status, subscribed_at, unsubscribed_at)
     VALUES (?, 'active', NOW(), NULL)
     ON DUPLICATE KEY UPDATE status='active', subscribed_at=NOW(), unsubscribed_at=NULL`,
    [email]
  );
}

export async function unsubscribe(email) {
  await pool.query(
    `UPDATE newsletter_subscribers SET status='unsubscribed', unsubscribed_at=NOW() WHERE email=?`,
    [email]
  );
}

export async function getSubscribers() {
  const [rows] = await pool.query(
    `SELECT id, email, subscribed_at, status FROM newsletter_subscribers WHERE status='active'`
  );
  return rows;
}

export async function addCampaign({ subject, content, post_id }) {
  const [result] = await pool.query(
    `INSERT INTO newsletter_campaigns (subject, content, post_id) VALUES (?, ?, ?)`,
    [subject, content, post_id || null]
  );
  return result.insertId;
}

export async function getCampaigns() {
  const [rows] = await pool.query(
    `SELECT * FROM newsletter_campaigns ORDER BY sent_at DESC`
  );
  return rows;
}

export async function sendEmail({ to, subject, html }) {
  return transporter.sendMail({
    from: process.env.GMAIL_USER,
    to,
    subject,
    html
  });
}

export async function sendNewsletterToAll({ subject, html }) {
  const subscribers = await getSubscribers();
  if (subscribers.length === 0) return { sent: 0 };
  let sent = 0;
  for (const s of subscribers) {
    const unsubscribeUrl = `https://jamjournal.com/unsubscribe?email=${encodeURIComponent(s.email)}`;
    const personalizedHtml = `${html}<br><br><a href=\"${unsubscribeUrl}\">Unsubscribe</a>`;
    await sendEmail({ to: s.email, subject, html: personalizedHtml });
    sent++;
  }
  return { sent };
} 