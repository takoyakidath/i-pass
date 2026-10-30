import express from 'express';
import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { createAdminRouter } from '../src/admin/routes.js';
import type { Config } from '../src/config.js';
import { createQuestion, listQuestions } from '../src/questions.js';
import { confirmedQuestion, freshDb, sampleInput } from './helpers.js';

const cfg = {
  adminEmails: ['a@x.jp'],
  sessionSecret: 'secret',
  baseUrl: 'http://localhost:3000',
  googleClientId: 'cid',
  googleClientSecret: 'cs',
} as Config;

async function setup() {
  const db = freshDb();
  const app = express();
  app.use(
    '/admin',
    createAdminRouter(
      { db, cfg },
      async () => ({ email: 'a@x.jp', emailVerified: true }),
      (state) => `http://google.test/auth?state=${state}`,
    ),
  );
  const agent = request.agent(app);
  const login = await agent.get('/admin/login');
  const state = new URL(login.headers.location, 'http://x').searchParams.get('state')!;
  await agent.get(`/admin/callback?code=c&state=${state}`);
  const page = await agent.get('/admin/questions');
  const token = /name="_csrf" value="([^"]+)"/.exec(page.text)![1];
  return { db, app, agent, token };
}

const form = (token: string, extra: Record<string, string> = {}) => ({
  _csrf: token,
  body: '新しい問題',
  choice0: 'A',
  choice1: 'B',
  choice2: 'C',
  choice3: 'D',
  answer: '1',
  explanation: '解説',
  source: '令和5年度 問1',
  category: 'テクノロジ',
  ...extra,
});

describe('admin auth wall', () => {
  test('every route redirects when not signed in', async () => {
    const { app } = await setup();
    for (const [method, path] of [
      ['get', '/admin/questions'],
      ['get', '/admin/queue'],
      ['post', '/admin/questions'],
      ['post', '/admin/queue'],
      ['post', '/admin/questions/1/status'],
      ['post', '/admin/queue/1/delete'],
    ] as const) {
      const res = await (request(app) as any)[method](path);
      expect(res.status, `${method} ${path}`).toBe(302);
    }
  });
});

describe('questions', () => {
  test('a created question is listed as a draft', async () => {
    const { agent, token } = await setup();
    expect((await agent.post('/admin/questions').type('form').send(form(token))).status).toBe(302);
    const list = await agent.get('/admin/questions');
    expect(list.text).toContain('新しい問題');
    expect(list.text).toContain('draft');
  });

  test('a POST without the csrf token is refused', async () => {
    const { agent, token } = await setup();
    const res = await agent.post('/admin/questions').type('form').send(form(token, { _csrf: 'nope' }));
    expect(res.status).toBe(403);
  });

  test('invalid input is a 400, not a crash', async () => {
    const { agent, token } = await setup();
    const res = await agent.post('/admin/questions').type('form').send(form(token, { choice3: '', answer: '9' }));
    expect(res.status).toBe(400);
  });

  test('confirming without a source is a 400', async () => {
    const { agent, token, db } = await setup();
    const q = createQuestion(db, sampleInput({ source: '' }));
    const res = await agent.post(`/admin/questions/${q.id}/status`).type('form').send({ _csrf: token, status: 'confirmed' });
    expect(res.status).toBe(400);
  });

  test('editing a question updates it', async () => {
    const { agent, token, db } = await setup();
    const q = createQuestion(db, sampleInput());
    const res = await agent.post(`/admin/questions/${q.id}`).type('form').send(form(token, { body: '修正後' }));
    expect(res.status).toBe(302);
    expect(listQuestions(db)[0].body).toBe('修正後');
  });
});

describe('queue', () => {
  test('a draft question cannot be queued (400)', async () => {
    const { agent, token, db } = await setup();
    const q = createQuestion(db, sampleInput());
    const res = await agent.post('/admin/queue').type('form').send({ _csrf: token, questionId: String(q.id), date: '2026-11-02' });
    expect(res.status).toBe(400);
  });

  test('queueing two questions on the same date is a 409', async () => {
    const { agent, token, db } = await setup();
    const a = confirmedQuestion(db);
    const b = confirmedQuestion(db, { body: 'b' });
    const post = (id: number) =>
      agent.post('/admin/queue').type('form').send({ _csrf: token, questionId: String(id), date: '2026-11-02' });
    expect((await post(a.id)).status).toBe(302);
    expect((await post(b.id)).status).toBe(409);
  });

  test('a queued question shows up and can be removed', async () => {
    const { agent, token, db } = await setup();
    const q = confirmedQuestion(db, { body: '予約する問題' });
    await agent.post('/admin/queue').type('form').send({ _csrf: token, questionId: String(q.id), date: '2999-01-01' });
    const page = await agent.get('/admin/queue');
    expect(page.text).toContain('予約する問題');
    const id = db.prepare('SELECT id FROM queue').get() as { id: number };
    await agent.post(`/admin/queue/${id.id}/delete`).type('form').send({ _csrf: token });
    expect(db.prepare('SELECT COUNT(*) c FROM queue').get()).toEqual({ c: 0 });
  });
});

describe('html escaping', () => {
  test('question text is escaped in the list', async () => {
    const { agent, db } = await setup();
    createQuestion(db, sampleInput({ body: '<script>alert(1)</script>' }));
    const list = await agent.get('/admin/questions');
    expect(list.text).not.toContain('<script>alert(1)</script>');
    expect(list.text).toContain('&lt;script&gt;');
  });
});
