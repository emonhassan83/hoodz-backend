import { Job, Worker } from 'bullmq';

import { getRedisClient } from '@/app/configs/redis.config';
import { emitSocketNotification } from '@/app/modules/notification/notification.helpers';
import { Notification } from '@/app/modules/notification/notification.model';
import {
  incrementUnreadCount,
  incrementUnreadCountForUsers,
} from '@/app/redis/helpers/notification';
import { sendPushNotification } from '@/app/utils/expoNotification';

export const initializeNotificationWorker = () => {
  const connection = getRedisClient();

  const worker = new Worker(
    'notification-queue',
    async (job: Job) => {
      const { traceId, channel, title, message, data } = job.data;
      console.log(
        `[Notification Worker] Processing ${job.name} (channel: ${channel})`
      );

      try {
        if (job.name === 'send-notification') {
          const { userId, fcmToken } = job.data;

          // 1. Socket notification (Save to DB & emit socket)
          if (channel === 'socket' || channel === 'both') {
            await Notification.create({
              receiver: userId,
              message: title,
              description: message,
              modelType: data?.modelType,
              reference: data?.reference,
            });
            await incrementUnreadCount(userId);

            emitSocketNotification(traceId, {
              receiver: userId,
              message: title,
              description: message,
              modelType: data?.modelType,
              reference: data?.reference,
            });
            console.log(
              `[Notification Worker] Socket notification sent & saved to DB for user ${userId}`
            );
          }

          // 2. Push notification (FCM)
          if (channel === 'push' || channel === 'both') {
            if (fcmToken) {
              await sendPushNotification({
                userIds: [userId],
                title,
                body: message,
                data: data as Record<string, unknown> | undefined,
              }).catch((error) => {
                console.warn(
                  `[Notification Worker] Expo send failed:`,
                  error instanceof Error ? error.message : error
                );
              });
              console.log(
                `[Notification Worker] Push notification sent via Expo for user ${userId}`
              );
            } else {
              console.log(
                `[Notification Worker] FCM token missing, skipped push notification for user ${userId}`
              );
            }
          }
        } else if (job.name === 'send-batch-notification') {
          const { userIds, fcmTokens } = job.data;

          // 1. Batch Socket notification
          if (channel === 'socket' || channel === 'both') {
            const notifications = userIds.map((userId: string) => ({
              receiver: userId,
              message: title,
              description: message,
              modelType: data?.modelType,
              reference: data?.reference,
            }));

            await Notification.insertMany(notifications);
            await incrementUnreadCountForUsers(userIds);

            userIds.forEach((userId: string) => {
              emitSocketNotification(traceId, {
                receiver: userId,
                message: title,
                description: message,
                modelType: data?.modelType,
                reference: data?.reference,
              });
            });
            console.log(
              `[Notification Worker] Batch socket notifications sent & saved to DB for ${userIds.length} users`
            );
          }

          // 2. Batch Push notification (fcmTokens from job data is no longer needed)
          if (channel === 'push' || channel === 'both') {
            if (userIds && userIds.length > 0) {
              await sendPushNotification({
                userIds,
                title,
                body: message,
                data: data as Record<string, unknown> | undefined,
              }).catch((error) => {
                console.warn(
                  `[Notification Worker] Expo multicast send failed:`,
                  error instanceof Error ? error.message : error
                );
              });
              console.log(
                `[Notification Worker] Batch push notification sent to ${userIds.length} users via Expo`
              );
            } else {
              console.log(
                `[Notification Worker] User IDs missing/empty, skipped batch push notification`
              );
            }
          }
        }
      } catch (error) {
        console.error(
          `[Notification Worker] Job ${job.id} failed processing:`,
          error
        );
        throw error;
      }
    },
    {
      connection: connection as any,
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`[Notification Worker] Job ${job?.id} failed:`, err);
  });

  console.log('[Notification Worker] Notification worker initialized');
  return worker;
};
