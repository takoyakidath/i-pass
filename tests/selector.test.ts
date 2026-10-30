import { describe, expect, test } from 'vitest';
import { enqueue, listQueue } from '../src/queue.js';
import { pickToday } from '../src/selector.js';
import { createQuestion, setStatus } from '../src/questions.js';
import { confirmedQuestion, freshDb, sampleInput } from './helpers.js';

const markPosted = (db: any, qid: number, date: string) =>
  db.prepare("INSERT INTO posts (question_id, channel, ts, posted_date) VALUES (?, 'C1', '1.0', ?)").run(qid, date);

describe('pickToday', () => {
  test('returns the queued question for today', () => {
    const db = freshDb();
    confirmedQuestion(db);
    const queued = confirmedQuestion(db, { body: 'queued' });
    enqueue(db, queued.id, '2026-11-01');
    expect(pickToday(db, '2026-11-01')?.id).toBe(queued.id);
  });

  test('falls back to random when the queued question was reverted to draft', () => {
    const db = freshDb();
    const other = confirmedQuestion(db, { body: 'other' });
    const queued = confirmedQuestion(db, { body: 'queued' });
    enqueue(db, queued.id, '2026-11-01');
    setStatus(db, queued.id, 'draft');
    expect(pickToday(db, '2026-11-01')?.id).toBe(other.id);
  });

  test('random pick skips posted and draft questions, deterministic with rng', () => {
    const db = freshDb();
    const posted = confirmedQuestion(db, { body: 'posted' });
    markPosted(db, posted.id, '2026-10-01');
    createQuestion(db, sampleInput({ body: 'draft' }));
    const a = confirmedQuestion(db, { body: 'a' });
    const b = confirmedQuestion(db, { body: 'b' });
    expect(pickToday(db, '2026-11-01', () => 0)?.id).toBe(a.id);
    expect(pickToday(db, '2026-11-01', () => 0.99)?.id).toBe(b.id);
  });

  test('random pick leaves questions queued for a future date alone', () => {
    const db = freshDb();
    const future = confirmedQuestion(db, { body: 'future' });
    enqueue(db, future.id, '2026-11-09');
    expect(pickToday(db, '2026-11-01')).toBeNull();
  });

  test('returns null with no confirmed stock or when everything was posted', () => {
    const db = freshDb();
    createQuestion(db, sampleInput());
    expect(pickToday(db, '2026-11-01')).toBeNull();
    const q = confirmedQuestion(db, { body: 'x' });
    markPosted(db, q.id, '2026-10-01');
    expect(pickToday(db, '2026-11-01')).toBeNull();
  });
});

describe('queue', () => {
  test('a second enqueue on the same date fails', () => {
    const db = freshDb();
    const a = confirmedQuestion(db);
    const b = confirmedQuestion(db, { body: 'b' });
    enqueue(db, a.id, '2026-11-01');
    expect(() => enqueue(db, b.id, '2026-11-01')).toThrow(/date.*already/);
  });

  test('the same question cannot be queued twice', () => {
    const db = freshDb();
    const a = confirmedQuestion(db);
    enqueue(db, a.id, '2026-11-01');
    expect(() => enqueue(db, a.id, '2026-11-02')).toThrow(/already queued/);
  });

  test('a draft question cannot be enqueued', () => {
    const db = freshDb();
    const d = createQuestion(db, sampleInput());
    expect(() => enqueue(db, d.id, '2026-11-01')).toThrow(/confirmed/);
  });

  test('listQueue returns upcoming entries in date order', () => {
    const db = freshDb();
    const a = confirmedQuestion(db);
    const b = confirmedQuestion(db, { body: 'b' });
    enqueue(db, b.id, '2026-11-03');
    enqueue(db, a.id, '2026-11-02');
    const c = confirmedQuestion(db, { body: 'c' });
    enqueue(db, c.id, '2026-10-01');
    expect(listQueue(db, '2026-11-01').map((e) => e.date)).toEqual(['2026-11-02', '2026-11-03']);
  });
});
