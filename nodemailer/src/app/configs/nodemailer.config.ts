import { type TransportOptions, createTransport } from 'nodemailer';

import { env } from '@/app/configs/env.configs';

const mailTransporter = createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  disableFileAccess: true,
  disableUrlAccess: true,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
} as TransportOptions);

export default mailTransporter;
