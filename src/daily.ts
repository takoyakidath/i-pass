import type { Config } from './config.js';
import type { Db } from './db.js';
import { formatExplanation, formatQuestion, REACTIONS } from './format.js';
import { getQuestion } from './questions.js';
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

  // Claim the date synchronously (before any await) so overlapping runs - cron, catch-up,
  // manual post - cannot both reach Slack. The UNIQUE posted_date makes the loser see 'already'.
  try {
    db.prepare("INSERT INTO posts (question_id, channel, ts, posted_date) VALUES (?, ?, 'pending', ?)").run(
      question.id,
      cfg.quizChannelId,
      date,
    );
  } catch (err) {
    if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') return 'already';
    throw err;
  }

  let ts: string;
  try {
    ({ ts } = await slack.postMessage(cfg.quizChannelId, formatQuestion(question, date)));
  } catch (err) {
    db.prepare("DELETE FROM posts WHERE posted_date = ? AND ts = 'pending'").run(date);
    await slack.notifyOps(`${date}: 出題の投稿に失敗しました: ${message(err)}`);
    return 'failed';
  }
  db.prepare("UPDATE posts SET ts = ? WHERE posted_date = ? AND ts = 'pending'").run(ts, date);

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

export async function postExplanation(
  { db, slack }: Deps,
  date: string,
): Promise<'replied' | 'already' | 'no-post' | 'failed'> {
  const post = db.prepare('SELECT * FROM posts WHERE posted_date = ?').get(date) as
    | { id: number; question_id: number; channel: string; ts: string; explained_at: string | null }
    | undefined;
  if (!post || post.ts === 'pending') return 'no-post';
  if (post.explained_at) return 'already';

  const question = getQuestion(db, post.question_id)!;
  try {
    await slack.replyInThread(post.channel, post.ts, formatExplanation(question));
  } catch (err) {
    await slack.notifyOps(`${date}: 解説の返信に失敗しました: ${message(err)}`);
    return 'failed';
  }
  db.prepare("UPDATE posts SET explained_at = datetime('now') WHERE id = ?").run(post.id);
  return 'replied';
}
