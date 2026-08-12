import { type TransportOptions, createTransport } from 'nodemailer';

import { env } from '@/app/configs/env.configs';

const mailTransporter = createTransport({
  host: env.MAIL_HOST,
  port: env.MAIL_PORT,
  secure: env.MAIL_SECURE,
  disableFileAccess: true,
  disableUrlAccess: true,
  auth: {
    user: env.MAIL_USER,
    pass: env.MAIL_PASS,
  },
} as TransportOptions);

export default mailTransporter;
