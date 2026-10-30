import type { Db } from './db.js';

export type Status = 'draft' | 'confirmed';
export type Question = {
  id: number;
  body: string;
  choices: [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
  explanation: string;
  source: string;
  category: string;
  status: Status;
};
export type QuestionInput = Omit<Question, 'id' | 'status'>;

function validate(q: Partial<QuestionInput>): void {
  if (q.choices !== undefined && (!Array.isArray(q.choices) || q.choices.length !== 4)) {
    throw new Error('choices must contain exactly 4 items');
  }
  if (q.answer !== undefined && ![0, 1, 2, 3].includes(q.answer)) {
    throw new Error('answer must be 0-3');
  }
  if (q.body !== undefined && !q.body.trim()) throw new Error('body is required');
}

function fromRow(r: any): Question {
  return { ...r, choices: JSON.parse(r.choices) };
}

export function getQuestion(db: Db, id: number): Question | undefined {
  const r = db.prepare('SELECT * FROM questions WHERE id = ?').get(id);
  return r ? fromRow(r) : undefined;
}

export function createQuestion(db: Db, input: QuestionInput): Question {
  validate(input);
  const info = db
    .prepare(
      `INSERT INTO questions (body, choices, answer, explanation, source, category)
       VALUES (@body, @choices, @answer, @explanation, @source, @category)`,
    )
    .run({ ...input, choices: JSON.stringify(input.choices) });
  return getQuestion(db, Number(info.lastInsertRowid))!;
}

export function updateQuestion(db: Db, id: number, patch: Partial<Omit<Question, 'id'>>): Question {
  validate(patch);
  const current = getQuestion(db, id);
  if (!current) throw new Error(`question ${id} not found`);
  const next = { ...current, ...patch };
  if (next.status === 'confirmed' && !next.source.trim()) {
    throw new Error('source is required for a confirmed question');
  }
  db.prepare(
    `UPDATE questions SET body=@body, choices=@choices, answer=@answer, explanation=@explanation,
       source=@source, category=@category, status=@status, updated_at=datetime('now') WHERE id=@id`,
  ).run({ ...next, choices: JSON.stringify(next.choices) });
  return getQuestion(db, id)!;
}

export function setStatus(db: Db, id: number, status: Status): void {
  updateQuestion(db, id, { status });
}

export function listQuestions(db: Db, filter: { status?: Status } = {}): Question[] {
  const rows = filter.status
    ? db.prepare('SELECT * FROM questions WHERE status = ? ORDER BY id').all(filter.status)
    : db.prepare('SELECT * FROM questions ORDER BY id').all();
  return rows.map(fromRow);
}
