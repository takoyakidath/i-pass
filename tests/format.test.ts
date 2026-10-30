import { describe, expect, test } from 'vitest';
import { choiceLabel, formatExplanation, formatQuestion, REACTIONS } from '../src/format.js';
import type { Question } from '../src/questions.js';

const q = (over: Partial<Question> = {}): Question => ({
  id: 1,
  body: 'ITとは?',
  choices: ['選択A', '選択B', '選択C', '選択D'],
  answer: 2,
  explanation: '解説本文',
  source: '令和5年度 問10',
  category: 'テクノロジ',
  status: 'confirmed',
  ...over,
});

describe('format', () => {
  test('question lists all four choices with their stamps', () => {
    const { text } = formatQuestion(q(), '2026-11-01');
    for (const c of ['選択A', '選択B', '選択C', '選択D']) expect(text).toContain(c);
    expect(text).toContain('ア');
    expect(text).toContain(':one:');
    expect(text).toContain(':four:');
  });

  test('explanation names the correct choice and the source', () => {
    const { text } = formatExplanation(q({ answer: 2 }));
    expect(text).toContain('正解: ウ');
    expect(text).toContain('出典: 令和5年度 問10');
    expect(text).toContain('解説本文');
  });

  test('escapes slack mrkdwn control characters', () => {
    const { text } = formatQuestion(q({ body: 'a < b & c > d' }), '2026-11-01');
    expect(text).toContain('a &lt; b &amp; c &gt; d');
  });

  test('choiceLabel and REACTIONS map ア-エ to one-four', () => {
    expect([0, 1, 2, 3].map((i) => choiceLabel(i as 0))).toEqual(['ア', 'イ', 'ウ', 'エ']);
    expect(REACTIONS).toEqual(['one', 'two', 'three', 'four']);
  });
});
