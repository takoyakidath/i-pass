import type { Question } from './questions.js';

export const REACTIONS = ['one', 'two', 'three', 'four'] as const;
const LABELS = ['ア', 'イ', 'ウ', 'エ'] as const;

export type SlackMessage = { text: string; blocks: unknown[] };

export function choiceLabel(i: 0 | 1 | 2 | 3): (typeof LABELS)[number] {
  return LABELS[i];
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const section = (text: string) => ({ type: 'section', text: { type: 'mrkdwn', text } });

export function formatQuestion(q: Question, date: string): SlackMessage {
  const choices = q.choices.map((c, i) => `:${REACTIONS[i]}: ${LABELS[i]}. ${esc(c)}`).join('\n');
  const text = [
    `*今日のITパスポート問題* (${date})`,
    '',
    esc(q.body),
    '',
    choices,
    '',
    'スタンプを押して回答してください。正解と解説はこのスレッドに返信します。',
  ].join('\n');
  return { text, blocks: [section(text)] };
}

export function formatExplanation(q: Question): SlackMessage {
  const text = [
    `*正解: ${LABELS[q.answer]}*`,
    '',
    esc(q.explanation),
    '',
    `出典: ${esc(q.source)}`,
  ].join('\n');
  return { text, blocks: [section(text)] };
}
