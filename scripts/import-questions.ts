import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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
const base = dirname(resolve(file));
const res = importQuestions(db, JSON.parse(readFileSync(file, 'utf8')), {
  defaultSource: srcFlag?.slice('--default-source='.length),
  // Image paths are relative to the JSON file; only PNG crops are produced.
  readImage: (p) => ({ mime: 'image/png', data: readFileSync(resolve(base, p)) }),
});
console.log(`imported ${res.imported}, skipped ${res.skipped}, errors ${res.errors.length}`);
for (const e of res.errors) console.error(`  #${e.index}: ${e.message}`);
process.exit(res.errors.length > 0 ? 1 : 0);
