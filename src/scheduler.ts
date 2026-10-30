import cron from 'node-cron';
import { postDailyQuestion, postExplanation, type Deps } from './daily.js';

const TZ = 'Asia/Tokyo';
const MORNING = '07:00';

const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export const jstDate = (now: Date): string => dateFmt.format(now);
const jstTime = (now: Date): string => timeFmt.format(now);

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

export async function catchUp(deps: Deps, now: Date): Promise<void> {
  const date = jstDate(now);
  const time = jstTime(now);
  const hadPost = !!deps.db.prepare('SELECT 1 FROM posts WHERE posted_date = ?').get(date);
  if (time >= MORNING && !hadPost) await runMorning(deps, date);
  // A question that was only just posted must not be explained in the same breath.
  if (hadPost && time >= deps.cfg.explainTime) await postExplanation(deps, date);
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
    cron.schedule(`${m} ${h} * * *`, guard('解説の返信', async () => { await postExplanation(deps, jstDate(new Date())); }), {
      timezone: TZ,
    }),
  ];
  return { stop: () => tasks.forEach((t) => t.stop()) };
}
