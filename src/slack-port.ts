import type { WebClient } from '@slack/web-api';
import type { Config } from './config.js';
import type { SlackMessage } from './format.js';

export interface SlackPort {
  postMessage(channel: string, msg: SlackMessage): Promise<{ ts: string }>;
  addReaction(channel: string, ts: string, name: string): Promise<void>;
  replyInThread(channel: string, ts: string, msg: SlackMessage): Promise<void>;
  notifyOps(text: string): Promise<void>;
}

export function boltSlackPort(client: WebClient, cfg: Config): SlackPort {
  return {
    async postMessage(channel, msg) {
      const res = await client.chat.postMessage({ channel, text: msg.text, blocks: msg.blocks as any });
      if (!res.ts) throw new Error('chat.postMessage returned no ts');
      return { ts: res.ts };
    },
    async addReaction(channel, ts, name) {
      await client.reactions.add({ channel, timestamp: ts, name });
    },
    async replyInThread(channel, ts, msg) {
      await client.chat.postMessage({ channel, thread_ts: ts, text: msg.text, blocks: msg.blocks as any });
    },
    async notifyOps(text) {
      try {
        await client.chat.postMessage({ channel: cfg.opsChannelId, text: `:warning: ${text}` });
      } catch (err) {
        console.error('failed to notify ops channel:', err, text);
      }
    },
  };
}
