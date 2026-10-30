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
    explainTime: env.EXPLAIN_TIME || '20:00',
    adminEmails: need('ADMIN_EMAILS')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
    googleClientId: need('GOOGLE_CLIENT_ID'),
    googleClientSecret: need('GOOGLE_CLIENT_SECRET'),
    baseUrl: need('BASE_URL'),
    dbPath: env.DB_PATH || './data/i-pass.db',
    sessionSecret: need('SESSION_SECRET'),
    lowStockThreshold: Number(env.LOW_STOCK_THRESHOLD ?? 5),
  };
}
