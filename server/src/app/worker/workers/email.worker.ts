import { Worker, Job } from 'bullmq';

import { getOtpEmailTemplate } from '@/app/worker/templates/otp-email.template';

import { env } from '@/app/configs/env.configs';
import { sendEmail } from '@/app/configs/nodemailer.config';
import { getRedisClient } from '@/app/configs/redis.config';

export const initializeEmailWorker = () => {
  const connection = getRedisClient();

  const worker = new Worker(
    'email-queue',
    async (job: Job) => {
      switch (job.name) {
        case 'send-verification-email': {
          const { email, name, otp, expiresAt } = job.data;
          console.log(
            `[Email Worker] Processing send-verification-email for ${email}`
          );

          const mailOptions = {
            from: env.SMTP_USER,
            to: email,
            subject: 'Your Verification OTP Code',
            html: getOtpEmailTemplate(name, otp, expiresAt),
          };

          try {
            await sendEmail(mailOptions);
            console.log(
              `[Email Worker] Successfully sent OTP email to ${email}`
            );
          } catch (error) {
            console.error(
              `[Email Worker] Error sending OTP email to ${email}:`,
              error
            );
            throw error;
          }
          break;
        }

        default:
          console.warn(`[Email Worker] Unknown job name: ${job.name}`);
          break;
      }
    },
    {
      connection: connection as any,
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`[Email Worker] Job ${job?.id} failed:`, err);
  });

  console.log('[Email Worker] Email worker initialized');
  return worker;
};
