import cron from 'node-cron';
import { postDailyQuestion, postExplanation, type Deps } from './daily.js';

import { jstDate, jstTime } from './time.js';

export { jstDate };

const TZ = 'Asia/Tokyo';
const MORNING = '07:00';

async function remainingStock(deps: Deps): Promise<number> {
  const row = deps.db
    .prepare(
      `SELECT COUNT(*) AS c FROM questions
       WHERE status = 'confirmed' AND id NOT IN (SELECT question_id FROM posts)`,
    )
    .get() as { c: number };
  return row.c;
}

export async function runMorning(deps: Deps, date: string): Promise<void> {
  const result = await postDailyQuestion(deps, date);
  if (result !== 'posted') return;
  const left = await remainingStock(deps);
  if (left <= deps.cfg.lowStockThreshold) {
    await deps.slack.notifyOps(`出題可能な問題の残りが ${left} 問になりました。問題を追加してください。`);
  }
}

// Explain every earlier day whose explanation never went out (downtime, late manual post).
async function explainEarlier(deps: Deps, today: string): Promise<void> {
  const rows = deps.db
    .prepare(
      "SELECT posted_date FROM posts WHERE explained_at IS NULL AND ts != 'pending' AND posted_date < ? ORDER BY posted_date",
    )
    .all(today) as { posted_date: string }[];
  for (const r of rows) await postExplanation(deps, r.posted_date);
}

export async function runEvening(deps: Deps, date: string): Promise<void> {
  await explainEarlier(deps, date);
  await postExplanation(deps, date);
}

export async function catchUp(deps: Deps, now: Date): Promise<void> {
  const date = jstDate(now);
  const time = jstTime(now);
  const pending = deps.db.prepare("SELECT posted_date FROM posts WHERE ts = 'pending'").all() as { posted_date: string }[];
  if (pending.length > 0) {
    await deps.slack.notifyOps(
      `${pending.map((p) => p.posted_date).join(', ')}: 出題の結果が不明です(投稿前後でプロセスが停止した可能性)。チャンネルを確認してください。`,
    );
  }
  const hadPost = !!deps.db.prepare('SELECT 1 FROM posts WHERE posted_date = ?').get(date);
  if (time >= MORNING && !hadPost) await runMorning(deps, date);
  // A question that was only just posted must not be explained in the same breath.
  if (hadPost && time >= deps.cfg.explainTime) await postExplanation(deps, date);
  await explainEarlier(deps, date);
}

export function startScheduler(deps: Deps): { stop(): void } {
  const [h, m] = deps.cfg.explainTime.split(':').map(Number);
  const guard = (name: string, fn: () => Promise<void>) => async () => {
    try {
      await fn();
    } catch (err) {
      console.error(`${name} failed:`, err);
      await deps.slack.notifyOps(`${name} で予期しないエラー: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  const tasks = [
    cron.schedule('0 7 * * *', guard('毎朝の出題', () => runMorning(deps, jstDate(new Date()))), { timezone: TZ }),
    cron.schedule(`${m} ${h} * * *`, guard('解説の返信', () => runEvening(deps, jstDate(new Date()))), {
      timezone: TZ,
    }),
  ];
  return { stop: () => tasks.forEach((t) => t.stop()) };
}
