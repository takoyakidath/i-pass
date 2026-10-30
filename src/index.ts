import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import bolt from '@slack/bolt';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { catchUp, startScheduler } from './scheduler.js';
import { boltSlackPort } from './slack-port.js';

const cfg = loadConfig(process.env);
if (cfg.dbPath !== ':memory:') mkdirSync(dirname(cfg.dbPath), { recursive: true });
const db = openDb(cfg.dbPath);

const receiver = new bolt.ExpressReceiver({ signingSecret: cfg.slackSigningSecret });
const app = new bolt.App({ token: cfg.slackBotToken, receiver });
const deps = { db, slack: boltSlackPort(app.client, cfg), cfg };

await app.start(Number(process.env.PORT ?? 3000));
await catchUp(deps, new Date());
startScheduler(deps);
console.log('i-pass bot started');
