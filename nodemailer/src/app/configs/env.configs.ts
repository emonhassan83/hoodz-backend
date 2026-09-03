import { TEnv } from '@/app/@types/system.types';
import { getEnv, getNumberEnv } from '@/app/utils/env.utils';

export const env: TEnv = {
  NODE_ENV: getEnv('NODE_ENV', 'development'),
  PORT: getNumberEnv('PORT', '3000'),
  CORS_ORIGIN: getEnv('CORS_ORIGIN', '*'),
  SMTP_USER: getEnv('SMTP_USER'),
  SMTP_PASS: getEnv('SMTP_PASS'),
};
