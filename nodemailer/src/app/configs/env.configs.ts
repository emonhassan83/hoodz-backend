import { TEnv } from '@/app/@types/system.types';
import { getBooleanEnv, getEnv, getNumberEnv } from '@/app/utils/env.utils';

export const env: TEnv = {
  NODE_ENV: getEnv('NODE_ENV', 'development'),
  PORT: getNumberEnv('PORT', '3000'),
  CORS_ORIGIN: getEnv('CORS_ORIGIN', '*'),
  MAIL_HOST: getEnv(
    'MAIL_HOST',
    process.env.SMTP_HOST ?? process.env.NODEMAILLER_SMTP_HOST ?? 'smtp.gmail.com'
  ),
  MAIL_PORT: getNumberEnv(
    'MAIL_PORT',
    process.env.SMTP_PORT ?? process.env.NODEMAILLER_SMTP_PORT ?? '587'
  ),
  MAIL_SECURE: getBooleanEnv(
    'MAIL_SECURE',
    process.env.SMTP_SECURE ?? process.env.NODEMAILLER_SMTP_SECURE ?? 'false'
  ),
  MAIL_USER: getEnv(
    'MAIL_USER',
    process.env.SMTP_USER ?? process.env.NODEMAILLER_HOST_MAIL
  ),
  MAIL_PASS: getEnv(
    'MAIL_PASS',
    process.env.SMTP_PASS ?? process.env.NODEMAILLER_HOST_PASS
  ),
  MAIL_FROM: getEnv(
    'MAIL_FROM',
    process.env.SMTP_FROM ??
      process.env.NODEMAILLER_FROM_MAIL ??
      process.env.MAIL_USER ??
      process.env.SMTP_USER ??
      process.env.NODEMAILLER_HOST_MAIL
  ),
};
