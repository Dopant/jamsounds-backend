import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();
import seoRoutes from './routes/seo.js';
import authRoutes from './routes/auth.js';
import authorsRoutes from './routes/authors.js';
import postsRoutes from './routes/posts.js';
import analyticsRoutes from './routes/analytics.js';
import newsletterRoutes from './routes/newsletter.js';
import genresRoutes from './routes/genres.js';
import { seedInitialAdmin } from './models/admin.js';
import path from 'path';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/authors', authorsRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/genres', genresRoutes);

// Serve uploaded files
app.use('/uploads', express.static(path.resolve('uploads')));

// Server-render the public pages for people and crawlers alike.
app.use(seoRoutes);
app.use((req, res) => res.status(404).json({ message: 'Not found' }));

// Seed admin user
seedInitialAdmin();

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 