import { describe, expect, test } from 'vitest';
import { postDailyQuestion } from '../src/daily.js';
import type { Config } from '../src/config.js';
import { confirmedQuestion, freshDb } from './helpers.js';
import { FakeSlack } from './fake-slack.js';

const cfg = { quizChannelId: 'CQUIZ', opsChannelId: 'COPS', explainTime: '20:00', lowStockThreshold: 5 } as Config;
const setup = () => ({ db: freshDb(), slack: new FakeSlack(), cfg });

describe('postDailyQuestion', () => {
  test('posts once, adds four stamps in order, records the post', async () => {
    const d = setup();
    const q = confirmedQuestion(d.db);
    expect(await postDailyQuestion(d, '2026-11-01')).toBe('posted');
    expect(d.slack.messages).toHaveLength(1);
    expect(d.slack.messages[0].channel).toBe('CQUIZ');
    expect(d.slack.reactions.map((r) => r.name)).toEqual(['one', 'two', 'three', 'four']);
    const row = d.db.prepare('SELECT * FROM posts').get() as any;
    expect(row).toMatchObject({ question_id: q.id, channel: 'CQUIZ', posted_date: '2026-11-01' });
  });

  test('a second call on the same date does not post again', async () => {
    const d = setup();
    confirmedQuestion(d.db);
    confirmedQuestion(d.db, { body: 'b' });
    await postDailyQuestion(d, '2026-11-01');
    expect(await postDailyQuestion(d, '2026-11-01')).toBe('already');
    expect(d.slack.messages).toHaveLength(1);
  });

  test('no stock: nothing posted and ops are told', async () => {
    const d = setup();
    expect(await postDailyQuestion(d, '2026-11-01')).toBe('no-stock');
    expect(d.slack.messages).toHaveLength(0);
    expect(d.slack.ops).toHaveLength(1);
  });

  test('postMessage failure notifies ops and records nothing', async () => {
    const d = setup();
    confirmedQuestion(d.db);
    d.slack.failPost = true;
    expect(await postDailyQuestion(d, '2026-11-01')).toBe('failed');
    expect(d.slack.ops).toHaveLength(1);
    expect(d.db.prepare('SELECT COUNT(*) c FROM posts').get()).toEqual({ c: 0 });
  });

  test('a failed stamp still counts as posted, and ops are told', async () => {
    const d = setup();
    confirmedQuestion(d.db);
    d.slack.failReactionAt = 1;
    expect(await postDailyQuestion(d, '2026-11-01')).toBe('posted');
    expect(d.db.prepare('SELECT COUNT(*) c FROM posts').get()).toEqual({ c: 1 });
    expect(d.slack.ops).toHaveLength(1);
  });
});
