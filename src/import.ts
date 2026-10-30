import type { Db } from './db.js';
import { createQuestion, type QuestionInput } from './questions.js';

export type ImportResult = {
  imported: number;
  skipped: number;
  errors: { index: number; message: string }[];
};

export function importQuestions(db: Db, json: unknown): ImportResult {
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] };
  if (!Array.isArray(json)) {
    result.errors.push({ index: -1, message: 'payload must be a JSON array' });
    return result;
  }
  const exists = db.prepare('SELECT 1 FROM questions WHERE body = ?');
  json.forEach((item, index) => {
    try {
      if (typeof item !== 'object' || item === null) throw new Error('item must be an object');
      const q = item as QuestionInput;
      if (exists.get(q.body)) {
        result.skipped++;
        return;
      }
      createQuestion(db, {
        body: q.body,
        choices: q.choices,
        answer: q.answer,
        explanation: q.explanation ?? '',
        source: q.source ?? '',
        category: q.category ?? '',
      });
      result.imported++;
    } catch (err) {
      result.errors.push({ index, message: err instanceof Error ? err.message : String(err) });
    }
  });
  return result;
}
