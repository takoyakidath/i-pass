import { randomBytes } from 'node:crypto';
import express, { type RequestHandler, type Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import type { Config } from '../config.js';

export type CodeVerifier = (code: string) => Promise<{ email: string; emailVerified: boolean }>;

const SESSION_COOKIE = 'admin_session';
const STATE_COOKIE = 'oauth_state';
const EIGHT_HOURS = 8 * 60 * 60 * 1000;

export const isAllowed = (email: string, cfg: Config): boolean => cfg.adminEmails.includes(email.trim().toLowerCase());

const cookieOpts = (cfg: Config, maxAge: number) => ({
  signed: true,
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: cfg.baseUrl.startsWith('https://'),
  maxAge,
});

// The signed payload is `email|expiresAtMs`, so expiry is enforced server-side
// and does not depend on the browser honouring the cookie's own maxAge.
export function setSession(res: Response, email: string, cfg: Config): void {
  res.cookie(SESSION_COOKIE, `${email.toLowerCase()}|${Date.now() + EIGHT_HOURS}`, cookieOpts(cfg, EIGHT_HOURS));
}

function readSession(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const i = value.lastIndexOf('|');
  if (i < 0) return null;
  const expiresAt = Number(value.slice(i + 1));
  if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) return null;
  return value.slice(0, i);
}

export function requireAdmin(cfg: Config): RequestHandler {
  return (req, res, next) => {
    const email = readSession(req.signedCookies?.[SESSION_COOKIE]);
    if (email === null) return res.redirect('/admin/login');
    if (!isAllowed(email, cfg)) return res.status(403).send('forbidden');
    res.locals.adminEmail = email;
    next();
  };
}

const oauthClient = (cfg: Config) =>
  new OAuth2Client(cfg.googleClientId, cfg.googleClientSecret, `${cfg.baseUrl}/admin/callback`);

export function googleAuthUrl(cfg: Config): (state: string) => string {
  const client = oauthClient(cfg);
  return (state) => client.generateAuthUrl({ scope: ['openid', 'email'], state, prompt: 'select_account' });
}

export function googleVerifier(cfg: Config): CodeVerifier {
  const client = oauthClient(cfg);
  return async (code) => {
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) throw new Error('no id_token');
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: cfg.googleClientId });
    const p = ticket.getPayload();
    return { email: p?.email ?? '', emailVerified: p?.email_verified === true };
  };
}

export function createAuthRouter(
  cfg: Config,
  verify: CodeVerifier = googleVerifier(cfg),
  authUrl: (state: string) => string = googleAuthUrl(cfg),
): express.Router {
  const router = express.Router();

  router.get('/login', (_req, res) => {
    const state = randomBytes(16).toString('hex');
    res.cookie(STATE_COOKIE, state, cookieOpts(cfg, 10 * 60 * 1000));
    res.redirect(authUrl(state));
  });

  router.get('/callback', async (req, res) => {
    const expected: unknown = req.signedCookies?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE);
    if (typeof expected !== 'string' || req.query.state !== expected) return res.status(400).send('invalid state');
    try {
      const { email, emailVerified } = await verify(String(req.query.code ?? ''));
      if (!emailVerified || !isAllowed(email, cfg)) return res.status(403).send('forbidden');
      setSession(res, email, cfg);
      res.redirect('/admin/questions');
    } catch (err) {
      console.error('login failed:', err);
      res.status(401).send('login failed');
    }
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE);
    res.redirect('/admin/login');
  });

  return router;
}
