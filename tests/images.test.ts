import express from 'express';
import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { formatQuestion } from '../src/format.js';
import { createImageRouter } from '../src/images.js';
import { importQuestions } from '../src/import.js';
import { createQuestion, deleteQuestion, getQuestion, listQuestions, setQuestionImage } from '../src/questions.js';
import { freshDb, sampleInput } from './helpers.js';

const PNG = Buffer.from('89504e470d0a1a0a', 'hex');

describe('question images', () => {
  test('attached image shows up on the question and is served publicly by token', async () => {
    const db = freshDb();
    const q = createQuestion(db, sampleInput());
    const token = setQuestionImage(db, q.id, 'image/png', PNG);
    expect(getQuestion(db, q.id)?.imageToken).toBe(token);
    expect(listQuestions(db)[0].imageToken).toBe(token);

    const app = express().use(createImageRouter(db));
    const res = await request(app).get(`/img/${token}.png`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(res.body).equals(PNG)).toBe(true);
  });

  test('unknown or malformed names are 404', async () => {
    const db = freshDb();
    const app = express().use(createImageRouter(db));
    expect((await request(app).get('/img/' + 'a'.repeat(24) + '.png')).status).toBe(404);
    expect((await request(app).get('/img/1.png')).status).toBe(404);
    expect((await request(app).get('/img/' + 'a'.repeat(24))).status).toBe(404);
  });

  test('replacing the image rotates the token', () => {
    const db = freshDb();
    const q = createQuestion(db, sampleInput());
    const t1 = setQuestionImage(db, q.id, 'image/png', PNG);
    const t2 = setQuestionImage(db, q.id, 'image/png', PNG);
    expect(t2).not.toBe(t1);
  });

  test('deleting a question removes its image', () => {
    const db = freshDb();
    const q = createQuestion(db, sampleInput());
    setQuestionImage(db, q.id, 'image/png', PNG);
    deleteQuestion(db, q.id);
    expect(db.prepare('SELECT COUNT(*) AS n FROM question_images').get()).toEqual({ n: 0 });
  });

  test('formatQuestion puts the image between stem and choices', () => {
    const db = freshDb();
    const q = createQuestion(db, sampleInput({ body: '図を見て答えてください。' }));
    setQuestionImage(db, q.id, 'image/png', PNG);
    const { blocks, text } = formatQuestion(getQuestion(db, q.id)!, '2026-11-01', 'https://bot.example.com/');
    expect(blocks).toHaveLength(3);
    expect((blocks[1] as any).image_url).toMatch(/^https:\/\/bot\.example\.com\/img\/[0-9a-f]{24}\.png$/);
    expect((blocks[0] as any).text.text).toContain('図を見て答えてください。');
    expect((blocks[2] as any).text.text).toContain('スタンプを押して');
    expect(text).toContain('図を見て答えてください。');
  });

  test('a question without an image keeps the single-block message', () => {
    const db = freshDb();
    const q = createQuestion(db, sampleInput());
    expect(formatQuestion(q, '2026-11-01', 'https://bot.example.com').blocks).toHaveLength(1);
  });

  test('import attaches images and dedupes image items by source', () => {
    const db = freshDb();
    const item = (source: string) => ({ ...sampleInput({ source }), body: '図を見て答えてください。', image: 'a.png' });
    const opts = { readImage: () => ({ mime: 'image/png', data: PNG }) };
    const res = importQuestions(db, [item('IPA 令和5年度 問15'), item('IPA 令和5年度 問32'), item('IPA 令和5年度 問15')], opts);
    expect(res).toMatchObject({ imported: 2, skipped: 1, errors: [] });
    expect(listQuestions(db).every((q) => q.imageToken)).toBe(true);
  });

  test('import rejects an image item without a reader or a source', () => {
    const db = freshDb();
    const bad = { ...sampleInput(), image: 'a.png' };
    expect(importQuestions(db, [bad]).errors).toHaveLength(1);
    expect(importQuestions(db, [{ ...bad, source: '' }], { readImage: () => ({ mime: 'image/png', data: PNG }) }).errors).toHaveLength(1);
  });
});
