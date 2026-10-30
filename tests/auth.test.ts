import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { createAuthRouter, isAllowed, requireAdmin, setSession, type CodeVerifier } from '../src/admin/auth.js';
import type { Config } from '../src/config.js';

const cfg = {
  adminEmails: ['a@x.jp'],
  sessionSecret: 'secret',
  baseUrl: 'http://localhost:3000',
  googleClientId: 'cid',
  googleClientSecret: 'cs',
} as Config;

function makeApp(verify: CodeVerifier = async () => ({ email: 'a@x.jp', emailVerified: true })) {
  const app = express();
  app.use(cookieParser(cfg.sessionSecret));
  app.get('/login-as', (req, res) => {
    setSession(res, String(req.query.email), cfg);
    res.end();
  });
  app.use('/admin', createAuthRouter(cfg, verify, (state) => `http://google.test/auth?state=${state}`));
  app.get('/admin/secret', requireAdmin(cfg), (_req, res) => res.send('ok'));
  return app;
}

describe('isAllowed', () => {
  test('matches case-insensitively and rejects others', () => {
    expect(isAllowed('A@X.jp', cfg)).toBe(true);
    expect(isAllowed('b@x.jp', cfg)).toBe(false);
  });
});

describe('requireAdmin', () => {
  test('redirects to login when not signed in', async () => {
    const res = await request(makeApp()).get('/admin/secret');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin/login');
  });

  test('403 for a signed-in email outside the allowlist', async () => {
    const agent = request.agent(makeApp());
    await agent.get('/login-as?email=evil@x.jp');
    expect((await agent.get('/admin/secret')).status).toBe(403);
  });

  test('passes for an allowed email', async () => {
    const agent = request.agent(makeApp());
    await agent.get('/login-as?email=a@x.jp');
    expect((await agent.get('/admin/secret')).text).toBe('ok');
  });
});

describe('login flow', () => {
  const start = async (verify?: CodeVerifier) => {
    const agent = request.agent(makeApp(verify));
    const login = await agent.get('/admin/login');
    const state = new URL(login.headers.location, 'http://x').searchParams.get('state')!;
    return { agent, state };
  };

  test('login redirects to Google with a state', async () => {
    const { state } = await start();
    expect(state.length).toBeGreaterThan(10);
  });

  test('callback with a wrong state is rejected', async () => {
    const { agent } = await start();
    expect((await agent.get('/admin/callback?code=c&state=wrong')).status).toBe(400);
  });

  test('callback with an unverified or non-allowlisted email is 403', async () => {
    const a = await start(async () => ({ email: 'a@x.jp', emailVerified: false }));
    expect((await a.agent.get(`/admin/callback?code=c&state=${a.state}`)).status).toBe(403);
    const b = await start(async () => ({ email: 'evil@x.jp', emailVerified: true }));
    expect((await b.agent.get(`/admin/callback?code=c&state=${b.state}`)).status).toBe(403);
  });

  test('a valid callback signs the user in', async () => {
    const { agent, state } = await start();
    const res = await agent.get(`/admin/callback?code=c&state=${state}`);
    expect(res.status).toBe(302);
    expect((await agent.get('/admin/secret')).text).toBe('ok');
  });
});
