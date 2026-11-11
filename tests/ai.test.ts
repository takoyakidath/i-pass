import { describe, expect, test } from 'vitest';
import { parseDrafts, parseReview } from '../src/ai.js';

const ok = { body: 'q', choices: ['a', 'b', 'c', 'd'], answer: 2, explanation: 'e' };

describe('parseDrafts', () => {
  test('forces an empty source and prefers the requested category', () => {
    const [q] = parseDrafts([{ ...ok, source: '令和5年度 問1', category: 'ストラテジ' }], 'テクノロジ');
    expect(q.source).toBe('');
    expect(q.category).toBe('テクノロジ');
  });
  test('rejects malformed items', () => {
    expect(() => parseDrafts({}, '')).toThrow();
    expect(() => parseDrafts([{ ...ok, choices: ['a'] }], '')).toThrow(/1件目/);
    expect(() => parseDrafts([{ ...ok, answer: 4 }], '')).toThrow(/正解番号/);
    expect(() => parseDrafts([{ ...ok, choices: ['a', 'b', 'c', ''] }], '')).toThrow();
  });
});

describe('parseReview', () => {
  test('accepts a valid review and rejects an invalid one', () => {
    expect(parseReview({ explanation: 'x', answerOk: true }).note).toBe('');
    expect(() => parseReview({ explanation: '', answerOk: true })).toThrow();
    expect(() => parseReview({ explanation: 'x' })).toThrow();
  });
});
