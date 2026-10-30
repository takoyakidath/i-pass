import type { Db } from './db.js';
import { getQuestion, listQuestions, type Question } from './questions.js';

export function pickToday(db: Db, date: string, rng: () => number = Math.random): Question | null {
  const queued = db.prepare('SELECT question_id FROM queue WHERE scheduled_date = ?').get(date) as
    | { question_id: number }
    | undefined;
  if (queued) {
    const q = getQuestion(db, queued.question_id);
    if (q?.status === 'confirmed') return q;
  }
  const posted = new Set(
    (db.prepare('SELECT question_id FROM posts').all() as { question_id: number }[]).map((r) => r.question_id),
  );
  const reserved = new Set(
    (db.prepare('SELECT question_id FROM queue WHERE scheduled_date > ?').all(date) as { question_id: number }[]).map(
      (r) => r.question_id,
    ),
  );
  const pool = listQuestions(db, { status: 'confirmed' }).filter((q) => !posted.has(q.id) && !reserved.has(q.id));
  if (pool.length === 0) return null;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}
