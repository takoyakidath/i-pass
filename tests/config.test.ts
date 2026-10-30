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

  test.each(['8:30', '20', '25:00', '06:00', '07:00'])('EXPLAIN_TIME %s is rejected', (v) => {
    expect(() => loadConfig({ ...base, EXPLAIN_TIME: v })).toThrow(/EXPLAIN_TIME/);
  });

  test('EXPLAIN_TIME 07:01 and 23:59 are accepted', () => {
    expect(loadConfig({ ...base, EXPLAIN_TIME: '07:01' }).explainTime).toBe('07:01');
    expect(loadConfig({ ...base, EXPLAIN_TIME: '23:59' }).explainTime).toBe('23:59');
  });

  test.each(['abc', '-1', '2.5'])('LOW_STOCK_THRESHOLD %s is rejected', (v) => {
    expect(() => loadConfig({ ...base, LOW_STOCK_THRESHOLD: v })).toThrow(/LOW_STOCK_THRESHOLD/);
  });
});
