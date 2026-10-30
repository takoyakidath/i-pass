import { describe, expect, test } from 'vitest';
import { openDb } from '../src/db.js';

describe('openDb', () => {
  test('creates questions, queue and posts tables', () => {
    const db = openDb(':memory:');
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name);
    expect(names).toEqual(expect.arrayContaining(['questions', 'queue', 'posts']));
  });

  test('rejects an unknown question status', () => {
    const db = openDb(':memory:');
    expect(() =>
      db
        .prepare(
          "INSERT INTO questions (body, choices, answer, explanation, source, category, status) VALUES ('b','[]',0,'e','s','c','x')",
        )
        .run(),
    ).toThrow();
  });
});
