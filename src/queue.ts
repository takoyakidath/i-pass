import type { Db } from './db.js';
import { getQuestion, type Question } from './questions.js';

export function enqueue(db: Db, questionId: number, date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`invalid date: ${date}`);
  const q = getQuestion(db, questionId);
  if (!q) throw new Error(`question ${questionId} not found`);
  if (q.status !== 'confirmed') throw new Error('only confirmed questions can be queued');
  if (db.prepare('SELECT 1 FROM queue WHERE scheduled_date = ?').get(date)) {
    throw new Error(`date ${date} is already scheduled`);
  }
  if (db.prepare('SELECT 1 FROM queue WHERE question_id = ?').get(questionId)) {
    throw new Error(`question ${questionId} is already queued`);
  }
  db.prepare('INSERT INTO queue (question_id, scheduled_date) VALUES (?, ?)').run(questionId, date);
}

export function dequeue(db: Db, id: number): void {
  db.prepare('DELETE FROM queue WHERE id = ?').run(id);
}

export function listQueue(db: Db, from: string): { id: number; date: string; question: Question }[] {
  const rows = db
    .prepare('SELECT id, question_id, scheduled_date FROM queue WHERE scheduled_date >= ? ORDER BY scheduled_date')
    .all(from) as { id: number; question_id: number; scheduled_date: string }[];
  return rows.map((r) => ({ id: r.id, date: r.scheduled_date, question: getQuestion(db, r.question_id)! }));
}
