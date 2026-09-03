import { type TransportOptions, createTransport } from 'nodemailer';

import { env } from '@/app/configs/env.configs';

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
