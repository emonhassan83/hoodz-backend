import { CorsOptions } from 'cors';

/** Allow every origin. `true` reflects the request Origin so credentials still work. */
const corsConfiguration: CorsOptions = {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 200,
};

export default corsConfiguration;
