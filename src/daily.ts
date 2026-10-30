import type { Config } from './config.js';
import type { Db } from './db.js';
import { formatQuestion, REACTIONS } from './format.js';
import { pickToday } from './selector.js';
import type { SlackPort } from './slack-port.js';

export type Deps = { db: Db; slack: SlackPort; cfg: Config };

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export async function postDailyQuestion(
  { db, slack, cfg }: Deps,
  date: string,
): Promise<'posted' | 'already' | 'no-stock' | 'failed'> {
  if (db.prepare('SELECT 1 FROM posts WHERE posted_date = ?').get(date)) return 'already';

  const question = pickToday(db, date);
  if (!question) {
    await slack.notifyOps(`${date}: 確認済みの出題可能な問題がありません。問題を追加・確認済みにしてください。`);
    return 'no-stock';
  }

  let ts: string;
  try {
    ({ ts } = await slack.postMessage(cfg.quizChannelId, formatQuestion(question, date)));
  } catch (err) {
    await slack.notifyOps(`${date}: 出題の投稿に失敗しました: ${message(err)}`);
    return 'failed';
  }

  db.prepare('INSERT INTO posts (question_id, channel, ts, posted_date) VALUES (?, ?, ?, ?)').run(
    question.id,
    cfg.quizChannelId,
    ts,
    date,
  );

  const failed: string[] = [];
  for (const name of REACTIONS) {
    try {
      await slack.addReaction(cfg.quizChannelId, ts, name);
    } catch (err) {
      failed.push(`${name} (${message(err)})`);
    }
  }
  if (failed.length > 0) {
    await slack.notifyOps(`${date}: スタンプの付与に失敗しました: ${failed.join(', ')}`);
  }
  return 'posted';
}
