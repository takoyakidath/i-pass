export type Config = {
  slackBotToken: string;
  slackSigningSecret: string;
  quizChannelId: string;
  opsChannelId: string;
  explainTime: string;
  adminEmails: string[];
  googleClientId: string;
  googleClientSecret: string;
  baseUrl: string;
  dbPath: string;
  sessionSecret: string;
  lowStockThreshold: number;
};

function parseExplainTime(v: string | undefined): string {
  const t = v || '20:00';
  // Must be zero-padded HH:mm (string comparison is used at runtime) and after the 07:00 post.
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t) || t <= '07:00') {
    throw new Error(`EXPLAIN_TIME must be HH:mm later than 07:00, got: ${t}`);
  }
  return t;
}

function parseThreshold(v: string | undefined): number {
  if (v === undefined || v === '') return 5;
  if (!/^\d+$/.test(v)) throw new Error(`LOW_STOCK_THRESHOLD must be a non-negative integer, got: ${v}`);
  return Number(v);
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const need = (key: string): string => {
    const v = env[key];
    if (!v) throw new Error(`Missing required env var: ${key}`);
    return v;
  };
  return {
    slackBotToken: need('SLACK_BOT_TOKEN'),
    slackSigningSecret: need('SLACK_SIGNING_SECRET'),
    quizChannelId: need('QUIZ_CHANNEL_ID'),
    opsChannelId: need('OPS_CHANNEL_ID'),
    explainTime: parseExplainTime(env.EXPLAIN_TIME),
    adminEmails: need('ADMIN_EMAILS')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
    googleClientId: need('GOOGLE_CLIENT_ID'),
    googleClientSecret: need('GOOGLE_CLIENT_SECRET'),
    baseUrl: need('BASE_URL'),
    dbPath: env.DB_PATH || './data/i-pass.db',
    sessionSecret: need('SESSION_SECRET'),
    lowStockThreshold: parseThreshold(env.LOW_STOCK_THRESHOLD),
  };
}
