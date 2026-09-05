import { type TransportOptions, createTransport } from 'nodemailer';

import { env } from './env.configs';

export const assertSmtpConfig = (): void => {
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    throw new Error('SMTP_USER and SMTP_PASS must be set in Vercel Environment Variables');
  }
};

const mailTransporter = createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  disableFileAccess: true,
  disableUrlAccess: true,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
} as TransportOptions);

export default mailTransporter;
