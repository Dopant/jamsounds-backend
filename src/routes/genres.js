import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  getAllGenres,
  getGenreById,
  createGenre,
  updateGenre,
  deleteGenre
} from '../models/genres.js';

const router = express.Router();

// Get all genres
router.get('/', async (req, res) => {
  const genres = await getAllGenres();
  res.json(genres);
});

// Get a single genre by id
router.get('/:id', async (req, res) => {
  const genre = await getGenreById(req.params.id);
  if (!genre) return res.status(404).json({ message: 'Genre not found' });
  res.json(genre);
});

// Create a new genre
router.post('/', authenticateToken, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: 'Name is required' });
  const id = await createGenre(name);
  res.status(201).json({ id, name });
});

// Update a genre
router.put('/:id', authenticateToken, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: 'Name is required' });
  const updated = await updateGenre(req.params.id, name);
  if (!updated) return res.status(404).json({ message: 'Genre not found' });
  res.json({ id: req.params.id, name });
});

// Delete a genre
router.delete('/:id', authenticateToken, async (req, res) => {
  const deleted = await deleteGenre(req.params.id);
  if (!deleted) return res.status(404).json({ message: 'Genre not found' });
  res.json({ message: 'Genre deleted' });
});

export default router; 