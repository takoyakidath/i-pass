import { readFileSync } from 'node:fs';
import { importQuestions } from '../src/import.js';
import { openDb } from '../src/db.js';

const [file] = process.argv.slice(2);
if (!file) {
  console.error('usage: tsx scripts/import-questions.ts <questions.json>');
  process.exit(2);
}
const db = openDb(process.env.DB_PATH ?? './data/i-pass.db');
const res = importQuestions(db, JSON.parse(readFileSync(file, 'utf8')));
console.log(`imported ${res.imported}, skipped ${res.skipped}, errors ${res.errors.length}`);
for (const e of res.errors) console.error(`  #${e.index}: ${e.message}`);
process.exit(res.errors.length > 0 ? 1 : 0);
