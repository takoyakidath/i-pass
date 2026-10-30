import { describe, expect, test } from 'vitest';
import { loadConfig } from '../src/config.js';

const base = {
  SLACK_BOT_TOKEN: 'xoxb-1',
  SLACK_SIGNING_SECRET: 's',
  QUIZ_CHANNEL_ID: 'C1',
  OPS_CHANNEL_ID: 'C2',
  ADMIN_EMAILS: 'a@x.jp, B@x.jp',
  GOOGLE_CLIENT_ID: 'id',
  GOOGLE_CLIENT_SECRET: 'sec',
  BASE_URL: 'http://localhost:3000',
  SESSION_SECRET: 'ss',
};

describe('loadConfig', () => {
  test('missing OPS_CHANNEL_ID names the key in the error', () => {
    const { OPS_CHANNEL_ID: _, ...env } = base;
    expect(() => loadConfig(env)).toThrow(/OPS_CHANNEL_ID/);
  });

  test('EXPLAIN_TIME defaults to 20:00', () => {
    expect(loadConfig(base).explainTime).toBe('20:00');
  });

  test('ADMIN_EMAILS is split and lowercased', () => {
    expect(loadConfig(base).adminEmails).toEqual(['a@x.jp', 'b@x.jp']);
  });
});
