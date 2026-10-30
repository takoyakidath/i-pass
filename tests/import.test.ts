import { describe, expect, test } from 'vitest';
import { importQuestions } from '../src/import.js';
import { listQuestions } from '../src/questions.js';
import { freshDb } from './helpers.js';

const valid = (body: string) => ({
  body,
  choices: ['A', 'B', 'C', 'D'],
  answer: 1,
  explanation: '解説',
  source: '令和5年度 問1',
  category: 'ストラテジ',
});

describe('importQuestions', () => {
  test('imports valid items and reports the invalid one by index', () => {
    const db = freshDb();
    const bad = { ...valid('bad'), choices: ['A', 'B', 'C'] };
    const res = importQuestions(db, [valid('q1'), valid('q2'), bad]);
    expect(res.imported).toBe(2);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0].index).toBe(2);
  });

  test('everything imported is a draft', () => {
    const db = freshDb();
    importQuestions(db, [valid('q1'), valid('q2')]);
    expect(listQuestions(db).map((q) => q.status)).toEqual(['draft', 'draft']);
  });

  test('re-importing the same body does not create duplicates', () => {
    const db = freshDb();
    importQuestions(db, [valid('q1')]);
    const res = importQuestions(db, [valid('q1')]);
    expect(res.imported).toBe(0);
    expect(res.skipped).toBe(1);
    expect(listQuestions(db)).toHaveLength(1);
  });

  test('a non-array payload and non-object items are rejected without throwing', () => {
    const db = freshDb();
    expect(importQuestions(db, { nope: 1 }).errors).toHaveLength(1);
    expect(importQuestions(db, [null, 'x']).errors.map((e) => e.index)).toEqual([0, 1]);
  });
});
