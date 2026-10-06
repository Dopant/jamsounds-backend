import express from 'express';
import authors, { validateAuthor, validAuthorId } from '../models/author.js';
import { authenticateToken } from '../middleware/auth.js';

export function createAuthorsRouter(store = authors, auth = authenticateToken) {
  const router = express.Router();
  router.use(auth);
  const failure = (res, error) => {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'An author with this name already exists. Select that profile instead.' });
    console.error('Author profiles failed:', error);
    return res.status(500).json({ message: 'Could not save or load author profiles' });
  };
  router.get('/', async (req, res) => {
    try { res.set('Cache-Control', 'no-store').json(await store.list()); }
    catch (error) { failure(res, error); }
  });
  router.post('/', async (req, res) => {
    let profile;
    try { profile = validateAuthor(req.body); }
    catch (error) { return res.status(400).json({ message: error.message }); }
    try { res.status(201).json(await store.create(profile)); }
    catch (error) { failure(res, error); }
  });
  router.put('/:id', async (req, res) => {
    let profile, id;
    try { id = validAuthorId(req.params.id); profile = validateAuthor(req.body); }
    catch (error) { return res.status(400).json({ message: error.message }); }
    try {
      if (!await store.get(id)) return res.status(404).json({ message: 'Author profile not found' });
      res.json(await store.update(id, profile));
    } catch (error) { failure(res, error); }
  });
  return router;
}
export default createAuthorsRouter();
