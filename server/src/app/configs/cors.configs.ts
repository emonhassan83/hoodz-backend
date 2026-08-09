import { CorsOptions } from 'cors';

import { logger } from '@/app/configs/logger.configs';
import { corsAllowedHosts, corsWhiteList } from '@/app/constant';

const isAllowedOrigin = (origin: string) => {
  if (corsWhiteList.includes(origin)) return true;

  try {
    const { hostname } = new URL(origin);
    return corsAllowedHosts.includes(hostname);
  } catch {
    return false;
  }
};

const corsConfiguration: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      logger.warn(`Blocked CORS request from origin: ${origin}`);
      callback(new Error('CORS not allowed'), false);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 200,
};

export default corsConfiguration;


