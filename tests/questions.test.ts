import { describe, expect, test } from 'vitest';
import { createQuestion, listQuestions, setStatus, updateQuestion } from '../src/questions.js';
import { freshDb, sampleInput } from './helpers.js';

describe('questions', () => {
  test('a new question is a draft', () => {
    const db = freshDb();
    expect(createQuestion(db, sampleInput()).status).toBe('draft');
  });

  test('rejects choices that are not exactly four', () => {
    const db = freshDb();
    expect(() => createQuestion(db, sampleInput({ choices: ['A', 'B', 'C'] as any }))).toThrow(/choices/);
  });

  test('rejects answer outside 0-3', () => {
    const db = freshDb();
    expect(() => createQuestion(db, sampleInput({ answer: 4 as any }))).toThrow(/answer/);
  });

  test('confirming without a source is rejected', () => {
    const db = freshDb();
    const q = createQuestion(db, sampleInput({ source: '' }));
    expect(() => setStatus(db, q.id, 'confirmed')).toThrow(/source/);
  });

  test('updating bumps updated_at', () => {
    const db = freshDb();
    const q = createQuestion(db, sampleInput());
    db.prepare("UPDATE questions SET updated_at = '2000-01-01 00:00:00' WHERE id = ?").run(q.id);
    updateQuestion(db, q.id, { body: '新しい問題文' });
    const row = db.prepare('SELECT body, updated_at FROM questions WHERE id = ?').get(q.id) as any;
    expect(row.body).toBe('新しい問題文');
    expect(row.updated_at).not.toBe('2000-01-01 00:00:00');
  });

  test('listQuestions filters by status', () => {
    const db = freshDb();
    const a = createQuestion(db, sampleInput());
    createQuestion(db, sampleInput({ body: '別' }));
    setStatus(db, a.id, 'confirmed');
    expect(listQuestions(db, { status: 'confirmed' }).map((q) => q.id)).toEqual([a.id]);
    expect(listQuestions(db)).toHaveLength(2);
  });
});
