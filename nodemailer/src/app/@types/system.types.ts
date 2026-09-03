export type TEnv = {
  NODE_ENV: string;
  PORT: number;
  CORS_ORIGIN: string;
  SMTP_USER: string;
  SMTP_PASS: string;
};

export type TSendMailBody = {
  to?: string;
  subject?: string;
  html?: string;
  text?: string;
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
