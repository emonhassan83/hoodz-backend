import { Job, Worker } from 'bullmq';

import { getRedisClient } from '@/app/configs/redis.config';
import { emitSocketNotification } from '@/app/modules/notification/notification.helpers';
import { Notification } from '@/app/modules/notification/notification.model';
import {
  incrementUnreadCount,
  incrementUnreadCountForUsers,
} from '@/app/redis/helpers/notification';
import { sendNotification } from '@/app/utils/sentPushNotification';

type TNotificationLanguage = 'english' | 'arabic';

const resolveLocalizedNotificationText = (
  language: TNotificationLanguage | undefined,
  title: string,
  message: string,
  titleArabic?: string,
  messageArabic?: string
) => {
  if (language === 'arabic') {
    return {
      title: titleArabic || title,
      message: messageArabic || message,
    };
  }

  return { title, message };
};

const groupPushTokensByLanguage = (
  recipients: {
    fcmToken?: string | null;
    language?: TNotificationLanguage;
  }[] = [],
  fallbackTokens: string[] = []
) => {
  const englishTokens = new Set<string>();
  const arabicTokens = new Set<string>();

  recipients.forEach((recipient) => {
    if (!recipient.fcmToken) return;
    if (recipient.language === 'arabic') {
      arabicTokens.add(recipient.fcmToken);
      return;
    }
    englishTokens.add(recipient.fcmToken);
  });

  if (recipients.length === 0) {
    fallbackTokens.forEach((token) => {
      if (token) englishTokens.add(token);
    });
  }

  return {
    englishTokens: [...englishTokens],
    arabicTokens: [...arabicTokens],
  };
};

export const initializeNotificationWorker = () => {
  const connection = getRedisClient();

  const worker = new Worker(
    'notification-queue',
    async (job: Job) => {
      const { traceId, channel, title, message, titleArabic, messageArabic, data } =
        job.data;
      console.log(
        `[Notification Worker] Processing ${job.name} (channel: ${channel})`
      );

      try {
        if (job.name === 'send-notification') {
          const { userId, fcmToken, language } = job.data;

          // 1. Socket notification (Save to DB & emit socket)
          if (channel === 'socket' || channel === 'both') {
            await Notification.create({
              receiver: userId,
              message: title,
              description: message,
              messageArabic: titleArabic,
              descriptionArabic: messageArabic,
              modelType: data?.modelType,
              reference: data?.reference,
            });
            await incrementUnreadCount(userId);

            emitSocketNotification(traceId, {
              receiver: userId,
              message: title,
              description: message,
              messageArabic: titleArabic,
              descriptionArabic: messageArabic,
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
              const localizedText = resolveLocalizedNotificationText(
                language,
                title,
                message,
                titleArabic,
                messageArabic
              );
              await sendNotification([fcmToken], {
                message: localizedText.title,
                description: localizedText.message,
                data,
              }).catch((error) => {
                console.warn(
                  `[Notification Worker] Firebase send failed:`,
                  error instanceof Error ? error.message : error
                );
              });
              console.log(
                `[Notification Worker] Push notification sent via Firebase for user ${userId}`
              );
            } else {
              console.log(
                `[Notification Worker] FCM token missing, skipped push notification for user ${userId}`
              );
            }
          }
        } else if (
          job.name === 'send-batch-notification' ||
          job.name === 'send-promotional-notification'
        ) {
          const { userIds, fcmTokens, recipients } = job.data;

          // 1. Batch Socket notification
          if (channel === 'socket' || channel === 'both') {
            const notifications = userIds.map((userId: string) => ({
              receiver: userId,
              message: title,
              description: message,
              messageArabic: titleArabic,
              descriptionArabic: messageArabic,
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
                messageArabic: titleArabic,
                descriptionArabic: messageArabic,
                modelType: data?.modelType,
                reference: data?.reference,
              });
            });
            console.log(
              `[Notification Worker] Batch socket notifications sent & saved to DB for ${userIds.length} users`
            );
          }

          // 2. Batch Push notification (FCM tokens are resolved before enqueue)
          if (channel === 'push' || channel === 'both') {
            const { englishTokens, arabicTokens } = groupPushTokensByLanguage(
              recipients,
              fcmTokens
            );
            const totalTokens = englishTokens.length + arabicTokens.length;

            if (totalTokens > 0) {
              if (englishTokens.length > 0) {
                await sendNotification(englishTokens, {
                  message: title,
                  description: message,
                  data,
                }).catch((error) => {
                  console.warn(
                    `[Notification Worker] Firebase english multicast send failed:`,
                    error instanceof Error ? error.message : error
                  );
                });
              }

              if (arabicTokens.length > 0) {
                const localizedText = resolveLocalizedNotificationText(
                  'arabic',
                  title,
                  message,
                  titleArabic,
                  messageArabic
                );

                await sendNotification(arabicTokens, {
                  message: localizedText.title,
                  description: localizedText.message,
                  data,
                }).catch((error) => {
                  console.warn(
                    `[Notification Worker] Firebase arabic multicast send failed:`,
                    error instanceof Error ? error.message : error
                  );
                });
              }

              console.log(
                `[Notification Worker] Batch push notification sent to ${totalTokens} devices via Firebase`
              );
            } else {
              console.log(
                `[Notification Worker] FCM tokens missing/empty, skipped batch push notification`
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
