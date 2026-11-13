import type { Db } from './db.js';
import { createQuestion, setQuestionImage, type QuestionInput } from './questions.js';

export type ImportResult = {
  imported: number;
  skipped: number;
  errors: { index: number; message: string }[];
};

// defaultSource fills a missing/empty `source`. Imported questions stay drafts either way.
// An item may carry `image` (a path): the figure crop shown with the question. `readImage` loads it;
// without it the item is rejected. Image items share a generic stem, so they dedupe on `source` instead of `body`.
export type ImportOpts = { defaultSource?: string; readImage?: (path: string) => { mime: string; data: Buffer } };

export function importQuestions(db: Db, json: unknown, opts: ImportOpts = {}): ImportResult {
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] };
  if (!Array.isArray(json)) {
    result.errors.push({ index: -1, message: 'payload must be a JSON array' });
    return result;
  }
  const exists = db.prepare('SELECT 1 FROM questions WHERE body = ?');
  const existsBySource = db.prepare('SELECT 1 FROM questions WHERE source = ?');
  json.forEach((item, index) => {
    try {
      if (typeof item !== 'object' || item === null) throw new Error('item must be an object');
      const q = item as QuestionInput & { image?: string };
      if (q.image !== undefined && !opts.readImage) throw new Error('image given but no image reader');
      if (q.image !== undefined && !q.source?.trim()) throw new Error('image items need a source (used to detect duplicates)');
      if (q.image !== undefined ? existsBySource.get(q.source) : exists.get(q.body)) {
        result.skipped++;
        return;
      }
      const img = q.image !== undefined ? opts.readImage!(q.image) : undefined;
      const created = createQuestion(db, {
        body: q.body,
        choices: q.choices,
        answer: q.answer,
        explanation: q.explanation ?? '',
        source: q.source?.trim() ? q.source : (opts.defaultSource ?? ''),
        category: q.category ?? '',
      });
      if (img) setQuestionImage(db, created.id, img.mime, img.data);
      result.imported++;
    } catch (err) {
      result.errors.push({ index, message: err instanceof Error ? err.message : String(err) });
    }
  });
  return result;
}
