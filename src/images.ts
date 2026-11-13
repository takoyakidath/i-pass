import express from 'express';
import type { Db } from './db.js';
import { getImageByToken } from './questions.js';

// Public on purpose: Slack's servers fetch the image. The token is random and unguessable.
export function createImageRouter(db: Db): express.Router {
  const router = express.Router();
  router.get('/img/:name', (req, res) => {
    const m = /^([0-9a-f]{24})\.png$/.exec(req.params.name);
    const img = m && getImageByToken(db, m[1]);
    if (!img) return res.status(404).send('not found');
    res.set({ 'Content-Type': img.mime, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
    res.send(img.data);
  });
  return router;
}
