import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import bolt from '@slack/bolt';
import { anthropicAi } from './ai.js';
import { createAdminRouter } from './admin/routes.js';
import { createImageRouter } from './images.js';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { postDailyQuestion } from './daily.js';
import { catchUp, startScheduler } from './scheduler.js';
import { boltSlackPort } from './slack-port.js';

const cfg = loadConfig(process.env);
if (cfg.dbPath !== ':memory:') mkdirSync(dirname(cfg.dbPath), { recursive: true });
const db = openDb(cfg.dbPath);

const receiver = new bolt.ExpressReceiver({ signingSecret: cfg.slackSigningSecret });
const app = new bolt.App({ token: cfg.slackBotToken, receiver });
const deps = { db, slack: boltSlackPort(app.client, cfg), cfg };
// AI機能は任意: ANTHROPIC_API_KEY があるときだけ管理画面に出る。
const ai = process.env.ANTHROPIC_API_KEY ? anthropicAi(new Anthropic(), process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5') : undefined;
receiver.router.use(createImageRouter(db));
receiver.router.use('/admin', createAdminRouter({ ...deps, postNow: (date) => postDailyQuestion(deps, date), ai }));

await app.start(Number(process.env.PORT ?? 3000));
await catchUp(deps, new Date());
startScheduler(deps);
console.log('i-pass bot started');
