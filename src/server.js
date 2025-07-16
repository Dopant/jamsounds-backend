import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();
import authRoutes from './routes/auth.js';
import postsRoutes from './routes/posts.js';
import { seedInitialAdmin } from './models/admin.js';
import path from 'path';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Music Blog Backend API');
});

app.use('/api/auth', authRoutes);
app.use('/api/posts', postsRoutes);

// Serve uploaded files
app.use('/uploads', express.static(path.resolve('uploads')));

// Seed admin user
seedInitialAdmin();

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 