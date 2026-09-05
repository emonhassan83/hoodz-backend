import { TEnv } from '../@types/system.types';
import { getEnv, getNumberEnv } from '../utils/env.utils';

export const env: TEnv = {
  NODE_ENV: getEnv('NODE_ENV', 'development'),
  PORT: getNumberEnv('PORT', '3000'),
  CORS_ORIGIN: getEnv('CORS_ORIGIN', '*'),
  SMTP_USER: process.env.SMTP_USER ?? '',
  SMTP_PASS: process.env.SMTP_PASS ?? '',
};
