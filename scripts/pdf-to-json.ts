import { readFileSync, writeFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';

const [pdfPath, outPath] = process.argv.slice(2);
if (!pdfPath || !outPath) {
  console.error('usage: tsx scripts/pdf-to-json.ts <input.pdf> <out.json>');
  process.exit(2);
}

const PROMPT = `添付はIPA公開のITパスポート試験問題PDFです。全問を次のJSON配列に変換してください。
各要素: {"body": 問題文, "choices": [ア,イ,ウ,エの本文(4要素)], "answer": 正解の0始まり番号(ア=0,イ=1,ウ=2,エ=3),
"explanation": 簡潔な解説, "source": 回次と問番号(例: "令和5年度 問10"), "category": "ストラテジ"|"マネジメント"|"テクノロジ"}
図表が必要で文章だけでは成立しない問題は除外してください。JSON配列のみを出力し、前後に説明やコードフェンスを付けないでください。`;

const client = new Anthropic();
const stream = client.messages.stream({
  model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5',
  max_tokens: 64000,
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: readFileSync(pdfPath).toString('base64') },
        },
        { type: 'text', text: PROMPT },
      ],
    },
  ],
});
const message = await stream.finalMessage();
if (message.stop_reason === 'max_tokens' || message.stop_reason === 'refusal') {
  console.error(`stopped early: ${message.stop_reason}`);
  process.exit(1);
}
const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
const json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
writeFileSync(outPath, JSON.stringify(json, null, 2));
console.log(`wrote ${Array.isArray(json) ? json.length : 0} questions to ${outPath} (review before importing)`);
