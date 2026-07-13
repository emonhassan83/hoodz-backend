import { TEnv } from '@/app/@types/system.types';
import { getBooleanEnv, getEnv, getNumberEnv } from '@/app/utils/env.utils';

export const env: TEnv = {
  NODE_ENV: getEnv('NODE_ENV', 'development'),
  PORT: getNumberEnv('PORT', '3000'),
  CORS_ORIGIN: getEnv('CORS_ORIGIN', '*'),
  SMTP_HOST: getEnv(
    'SMTP_HOST',
    process.env.NODEMAILLER_SMTP_HOST ?? 'smtp.gmail.com'
  ),
  SMTP_PORT: getNumberEnv(
    'SMTP_PORT',
    process.env.NODEMAILLER_SMTP_PORT ?? '587'
  ),
  SMTP_SECURE: getBooleanEnv(
    'SMTP_SECURE',
    process.env.NODEMAILLER_SMTP_SECURE ?? 'false'
  ),
  SMTP_USER: getEnv('SMTP_USER', process.env.NODEMAILLER_HOST_MAIL),
  SMTP_PASS: getEnv('SMTP_PASS', process.env.NODEMAILLER_HOST_PASS),
  SMTP_FROM: getEnv(
    'SMTP_FROM',
    process.env.NODEMAILLER_FROM_MAIL ??
      process.env.SMTP_USER ??
      process.env.NODEMAILLER_HOST_MAIL
  ),
};
