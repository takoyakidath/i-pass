import { describe, expect, test } from 'vitest';
import { postDailyQuestion, postExplanation } from '../src/daily.js';
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

describe('postExplanation', () => {
  test('replies once in the question thread and marks explained_at', async () => {
    const d = setup();
    confirmedQuestion(d.db);
    await postDailyQuestion(d, '2026-11-01');
    const ts = d.slack.messages.length ? (d.db.prepare('SELECT ts FROM posts').get() as any).ts : '';
    expect(await postExplanation(d, '2026-11-01')).toBe('replied');
    expect(d.slack.replies).toHaveLength(1);
    expect(d.slack.replies[0]).toMatchObject({ channel: 'CQUIZ', ts });
    expect(d.slack.replies[0].msg.text).toContain('正解: ウ');
    expect((d.db.prepare('SELECT explained_at FROM posts').get() as any).explained_at).not.toBeNull();
  });

  test('a second call does not reply again', async () => {
    const d = setup();
    confirmedQuestion(d.db);
    await postDailyQuestion(d, '2026-11-01');
    await postExplanation(d, '2026-11-01');
    expect(await postExplanation(d, '2026-11-01')).toBe('already');
    expect(d.slack.replies).toHaveLength(1);
  });

  test('no post that day: no-post and ops are not bothered', async () => {
    const d = setup();
    expect(await postExplanation(d, '2026-11-01')).toBe('no-post');
    expect(d.slack.ops).toHaveLength(0);
  });

  test('reply failure notifies ops and stays retryable', async () => {
    const d = setup();
    confirmedQuestion(d.db);
    await postDailyQuestion(d, '2026-11-01');
    d.slack.failReplies = true;
    expect(await postExplanation(d, '2026-11-01')).toBe('failed');
    expect(d.slack.ops).toHaveLength(1);
    expect((d.db.prepare('SELECT explained_at FROM posts').get() as any).explained_at).toBeNull();
    d.slack.failReplies = false;
    expect(await postExplanation(d, '2026-11-01')).toBe('replied');
  });
});

describe('postDailyQuestion concurrency', () => {
  test('two concurrent runs for the same date post only once', async () => {
    const d = setup();
    confirmedQuestion(d.db);
    confirmedQuestion(d.db, { body: 'b' });
    d.slack.postDelayMs = 20;
    const res = await Promise.all([postDailyQuestion(d, '2026-11-01'), postDailyQuestion(d, '2026-11-01')]);
    expect([...res].sort()).toEqual(['already', 'posted']);
    expect(d.slack.messages).toHaveLength(1);
  });

  test('a failed post releases the date so a retry can post', async () => {
    const d = setup();
    confirmedQuestion(d.db);
    d.slack.failPost = true;
    expect(await postDailyQuestion(d, '2026-11-01')).toBe('failed');
    d.slack.failPost = false;
    expect(await postDailyQuestion(d, '2026-11-01')).toBe('posted');
  });

  test('a leftover pending claim blocks a second post and is never explained', async () => {
    const d = setup();
    const q = confirmedQuestion(d.db);
    confirmedQuestion(d.db, { body: 'b' });
    d.db.prepare("INSERT INTO posts (question_id, channel, ts, posted_date) VALUES (?, 'CQUIZ', 'pending', '2026-11-01')").run(q.id);
    expect(await postDailyQuestion(d, '2026-11-01')).toBe('already');
    expect(d.slack.messages).toHaveLength(0);
    expect(await postExplanation(d, '2026-11-01')).toBe('no-post');
  });
});
