import type { SlackPort } from '../src/slack-port.js';
import type { SlackMessage } from '../src/format.js';

export class FakeSlack implements SlackPort {
  messages: { channel: string; msg: SlackMessage }[] = [];
  reactions: { channel: string; ts: string; name: string }[] = [];
  replies: { channel: string; ts: string; msg: SlackMessage }[] = [];
  ops: string[] = [];
  failPost = false;
  failReplies = false;
  failReactionAt: number | null = null;

  async postMessage(channel: string, msg: SlackMessage) {
    if (this.failPost) throw new Error('slack down');
    this.messages.push({ channel, msg });
    return { ts: `1700000000.00000${this.messages.length}` };
  }
  async addReaction(channel: string, ts: string, name: string) {
    if (this.failReactionAt === this.reactions.length) throw new Error('rate limited');
    this.reactions.push({ channel, ts, name });
  }
  async replyInThread(channel: string, ts: string, msg: SlackMessage) {
    if (this.failReplies) throw new Error('slack down');
    this.replies.push({ channel, ts, msg });
  }
  async notifyOps(text: string) {
    this.ops.push(text);
  }
}
