import type Anthropic from '@anthropic-ai/sdk';
import type { QuestionInput } from './questions.js';

export const CATEGORIES = ['ストラテジ', 'マネジメント', 'テクノロジ'] as const;

export type Review = { explanation: string; answerOk: boolean; note: string };

export interface AiPort {
  generateDrafts(opts: { category: string; theme: string; count: number }): Promise<QuestionInput[]>;
  reviewQuestion(q: QuestionInput): Promise<Review>;
}

const parseJson = (text: string): unknown => JSON.parse(text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''));

const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

export function parseDrafts(json: unknown, category: string): QuestionInput[] {
  if (!Array.isArray(json)) throw new Error('AIの応答が配列ではありません');
  return json.map((raw, i) => {
    const q = raw as Record<string, unknown>;
    if (!isStr(q?.body) || !Array.isArray(q.choices) || q.choices.length !== 4 || !q.choices.every(isStr)) {
      throw new Error(`${i + 1}件目の形式が不正です`);
    }
    if (![0, 1, 2, 3].includes(q.answer as number)) throw new Error(`${i + 1}件目の正解番号が不正です`);
    return {
      body: q.body,
      choices: q.choices as QuestionInput['choices'],
      answer: q.answer as QuestionInput['answer'],
      explanation: typeof q.explanation === 'string' ? q.explanation : '',
      // 出典は空のまま: 人が確認して出典を入れるまで「確認済み」にできない。
      source: '',
      category: category || (typeof q.category === 'string' ? q.category : ''),
    };
  });
}

export function parseReview(json: unknown): Review {
  const r = json as Record<string, unknown>;
  if (!isStr(r?.explanation) || typeof r.answerOk !== 'boolean') throw new Error('AIの応答の形式が不正です');
  return { explanation: r.explanation, answerOk: r.answerOk, note: typeof r.note === 'string' ? r.note : '' };
}

const GENERATE = (category: string, theme: string, count: number) =>
  `ITパスポート試験(国家試験)の対策用に、${count}問の四択問題を新規に作成してください。
分野: ${category || 'ストラテジ・マネジメント・テクノロジのいずれか'}
テーマ: ${theme || '指定なし(重要な頻出用語から)'}
条件: 過去問の文面をそのまま使わず、オリジナルの問題にする。文章だけで成立し、図表を必要としない。選択肢は4つ(ア,イ,ウ,エ)で正解は1つだけ。
各要素: {"body": 問題文, "choices": [4要素の本文], "answer": 正解の0始まり番号(ア=0), "explanation": 正解の理由と誤りの選択肢が誤りである理由を簡潔に, "category": "ストラテジ"|"マネジメント"|"テクノロジ"}
JSON配列のみを出力し、前後に説明やコードフェンスを付けないでください。`;

const REVIEW = (q: QuestionInput) =>
  `次のITパスポート試験の四択問題について、(1)指定された正解が本当に正しく、他に正解がないかを検証し、(2)学習者向けの解説を作成してください。
問題: ${q.body}
ア: ${q.choices[0]}
イ: ${q.choices[1]}
ウ: ${q.choices[2]}
エ: ${q.choices[3]}
指定された正解: ${'アイウエ'[q.answer]}
現在の解説: ${q.explanation || '(なし)'}
出力は次のJSONオブジェクトのみ(前後に説明やコードフェンスを付けない): {"explanation": 正解の理由と各誤り選択肢が誤りである理由(簡潔に、300字程度), "answerOk": 指定された正解が正しく一意ならtrue, "note": answerOkがfalseまたは問題文に不備がある場合にその理由(問題なければ空文字)}`;

export function anthropicAi(client: Anthropic, model: string): AiPort {
  async function ask(prompt: string, maxTokens: number): Promise<unknown> {
    const message = await client.messages.create({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] });
    if (message.stop_reason === 'max_tokens' || message.stop_reason === 'refusal') {
      throw new Error(`AIの応答が完了しませんでした(${message.stop_reason})`);
    }
    return parseJson(message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join(''));
  }
  return {
    async generateDrafts({ category, theme, count }) {
      return parseDrafts(await ask(GENERATE(category, theme, count), 8000), category);
    },
    async reviewQuestion(q) {
      return parseReview(await ask(REVIEW(q), 2000));
    },
  };
}
