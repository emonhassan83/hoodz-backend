import { IBatchNotificationPayload, INotificationPayload } from '@/app/@types/system.types';
import { getTraceId } from '@/app/configs/requestContext.configs';
import { getNotificationQueue } from '@/app/queues/queues';
import { User } from '@/app/modules/user/user.model';

/**
 * Send Notification via Queue
 * Single Responsibility: Enqueue notification jobs for async processing
 */
export const sendNotificationViaQueue = async (payload: INotificationPayload) => {
  const traceId = getTraceId();
  const queue = getNotificationQueue();

  const user = await User.findById(payload.userId)
    .select('fcmToken language')
    .lean();
  const fcmToken = payload.fcmToken ?? user?.fcmToken;
  const language = payload.language ?? user?.language ?? 'english';

  const jobData = {
    traceId,
    ...payload,
    fcmToken,
    language,
  };

  await queue.add('send-notification', jobData, {
    priority: 1,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  });

  return { success: true, message: 'Notification queued successfully' };
};

export const sendPromosionalNotificationViaQueue = async (
  payload: IBatchNotificationPayload
) => {
  const traceId = getTraceId();
  const queue = getNotificationQueue();
  const recipients =
    payload.recipients ??
    (
      await User.find({ _id: { $in: payload.userIds } })
        .select('_id fcmToken language')
        .lean()
    ).map((user) => ({
      userId: user._id.toString(),
      fcmToken: user.fcmToken,
      language: user.language ?? 'english',
    }));
  const fcmTokens =
    payload.fcmTokens ??
    recipients
      .map((recipient) => recipient.fcmToken)
      .filter((token): token is string => Boolean(token));

  const jobData = {
    traceId,
    ...payload,
    recipients,
    fcmTokens,
  };

  await queue.add('send-promotional-notification', jobData, {
    priority: 1,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  });

  return { success: true, message: 'Promotional notification queued successfully' };
};

/**
 * Send Batch Notification via Queue
 * Single Responsibility: Enqueue batch notification jobs for async processing
 */
export const sendBatchNotificationViaQueue = async (payload: IBatchNotificationPayload) => {
  const traceId = getTraceId();
  const queue = getNotificationQueue();
  const recipients =
    payload.recipients ??
    (
      await User.find({ _id: { $in: payload.userIds } })
        .select('_id fcmToken language')
        .lean()
    ).map((user) => ({
      userId: user._id.toString(),
      fcmToken: user.fcmToken,
      language: user.language ?? 'english',
    }));
  const fcmTokens =
    payload.fcmTokens ??
    recipients
      .map((recipient) => recipient.fcmToken)
      .filter((token): token is string => Boolean(token));

  const jobData = {
    traceId,
    ...payload,
    recipients,
    fcmTokens,
  };

  await queue.add('send-batch-notification', jobData, {
    priority: 1,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  });

  return { success: true, message: 'Batch notification queued successfully' };
};

/**
 * Send Push Notification via Queue
 * Convenience method for push-only notifications
 */
export const sendPushNotificationViaQueue = async (
  userId: string,
  fcmToken: string,
  title: string,
  message: string,
  data?: Record<string, any>,
  titleArabic?: string,
  messageArabic?: string
) => {
  return sendNotificationViaQueue({
    userId,
    channel: 'push',
    title,
    message,
    titleArabic,
    messageArabic,
    fcmToken,
    data,
  });
};

/**
 * Send Socket Notification via Queue
 * Convenience method for socket notifications (saves to DB only)
 */
export const sendSocketNotificationViaQueue = async (
  userId: string,
  title: string,
  message: string,
  data?: Record<string, any>,
  titleArabic?: string,
  messageArabic?: string
) => {
  return sendNotificationViaQueue({
    userId,
    channel: 'socket',
    title,
    message,
    titleArabic,
    messageArabic,
    data,
  });
};

/**
 * Send Both (Push + Socket) Notification via Queue
 * Convenience method for both push and socket notifications
 */
export const sendBothNotificationViaQueue = async (
  userId: string,
  fcmToken: string,
  title: string,
  message: string,
  data?: Record<string, any>,
  titleArabic?: string,
  messageArabic?: string
) => {
  return sendNotificationViaQueue({
    userId,
    channel: 'both',
    title,
    message,
    titleArabic,
    messageArabic,
    fcmToken,
    data,
  });
};


