import { openDb } from '../src/db.js';
import { createQuestion, setStatus, type Question } from '../src/questions.js';

export function freshDb() {
  return openDb(':memory:');
}

export function sampleInput(over: Partial<Omit<Question, 'id' | 'status'>> = {}) {
  return {
    body: '問題文',
    choices: ['A', 'B', 'C', 'D'] as [string, string, string, string],
    answer: 2 as const,
    explanation: '解説',
    source: '令和5年度 公開問題',
    category: 'テクノロジ',
    ...over,
  };
}

export function confirmedQuestion(db: ReturnType<typeof freshDb>, over = {}) {
  const q = createQuestion(db, sampleInput(over));
  setStatus(db, q.id, 'confirmed');
  return q;
}
