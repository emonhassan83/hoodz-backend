export type TEnv = {
  NODE_ENV: string;
  PORT: number;
  CORS_ORIGIN: string;
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_SECURE: boolean;
  SMTP_USER: string;
  SMTP_PASS: string;
  SMTP_FROM: string;
};

export type TSendMailBody = {
  to?: string;
  subject?: string;
  html?: string;
};

export type TMailOption = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  disableFileAccess: boolean;
  disableUrlAccess: boolean;
};

export type TShutdown = {
  reason: string;
  server: import('node:http').Server;
  error?: unknown;
};
