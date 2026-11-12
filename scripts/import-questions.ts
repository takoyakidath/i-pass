import { readFileSync } from 'node:fs';
import { importQuestions } from '../src/import.js';
import { openDb } from '../src/db.js';

const args = process.argv.slice(2);
const srcFlag = args.find((a) => a.startsWith('--default-source='));
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('usage: tsx scripts/import-questions.ts <questions.json> [--default-source="出典"]');
  process.exit(2);
}
const db = openDb(process.env.DB_PATH ?? './data/i-pass.db');
const res = importQuestions(db, JSON.parse(readFileSync(file, 'utf8')), { defaultSource: srcFlag?.slice('--default-source='.length) });
console.log(`imported ${res.imported}, skipped ${res.skipped}, errors ${res.errors.length}`);
for (const e of res.errors) console.error(`  #${e.index}: ${e.message}`);
process.exit(res.errors.length > 0 ? 1 : 0);
