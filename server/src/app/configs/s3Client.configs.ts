import { S3Client } from '@aws-sdk/client-s3';

import { env } from '@/app/configs/env.configs';

const s3Client = new S3Client({
  endpoint: env.SPACES_API,
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.S3_BUCKET_ACCESS_KEY,
    secretAccessKey: env.S3_BUCKET_SECRET_ACCESS_KEY,
  },
});

export default s3Client;


