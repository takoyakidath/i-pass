import { describe, expect, test } from 'vitest';
import { catchUp, jstDate, runMorning } from '../src/scheduler.js';
import type { Config } from '../src/config.js';
import { confirmedQuestion, freshDb } from './helpers.js';
import { FakeSlack } from './fake-slack.js';

const cfg = { quizChannelId: 'CQUIZ', opsChannelId: 'COPS', explainTime: '20:00', lowStockThreshold: 2 } as Config;
const setup = () => ({ db: freshDb(), slack: new FakeSlack(), cfg });
const at = (iso: string) => new Date(iso);

describe('jstDate', () => {
  test('UTC 22:00 is already the next day in JST', () => {
    expect(jstDate(at('2026-10-31T22:00:00Z'))).toBe('2026-11-01');
  });
});

describe('catchUp', () => {
  test('does nothing before 07:00 JST', async () => {
    const d = setup();
    confirmedQuestion(d.db);
    await catchUp(d, at('2026-11-01T06:59:00+09:00'));
    expect(d.slack.messages).toHaveLength(0);
  });

  test('posts a missed morning question after 07:00 JST, but only once', async () => {
    const d = setup();
    confirmedQuestion(d.db);
    confirmedQuestion(d.db, { body: 'b' });
    await catchUp(d, at('2026-11-01T07:01:00+09:00'));
    await catchUp(d, at('2026-11-01T07:02:00+09:00'));
    expect(d.slack.messages).toHaveLength(1);
  });

  test('replies with the explanation after explain time for an existing post', async () => {
    const d = setup();
    confirmedQuestion(d.db);
    await catchUp(d, at('2026-11-01T08:00:00+09:00'));
    await catchUp(d, at('2026-11-01T20:05:00+09:00'));
    expect(d.slack.replies).toHaveLength(1);
  });

  test('a question posted by catch-up after explain time is not explained at once', async () => {
    const d = setup();
    confirmedQuestion(d.db);
    await catchUp(d, at('2026-11-01T21:00:00+09:00'));
    expect(d.slack.messages).toHaveLength(1);
    expect(d.slack.replies).toHaveLength(0);
  });
});

describe('runMorning', () => {
  test('warns ops when remaining stock is at or below the threshold', async () => {
    const d = setup();
    confirmedQuestion(d.db);
    confirmedQuestion(d.db, { body: 'b' });
    confirmedQuestion(d.db, { body: 'c' });
    await runMorning(d, '2026-11-01');
    expect(d.slack.messages).toHaveLength(1);
    expect(d.slack.ops.some((t) => t.includes('残り'))).toBe(true);
  });

  test('stays quiet when stock is above the threshold', async () => {
    const d = setup();
    for (let i = 0; i < 5; i++) confirmedQuestion(d.db, { body: `q${i}` });
    await runMorning(d, '2026-11-01');
    expect(d.slack.ops).toHaveLength(0);
  });
});
