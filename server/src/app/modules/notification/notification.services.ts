import { HttpStatusCode } from 'axios';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import { INotification } from '@/app/modules/notification/notification.interface';
import { NOTIFICATION_MODEL_TYPE } from '@/app/modules/notification/notification.constant';
import { getActiveUserCursorForPromotional } from '@/app/modules/notification/notification.helpers';
import { Notification } from '@/app/modules/notification/notification.model';
import { TPromosionalNotificationPayload } from '@/app/modules/notification/notification.types';
import {
  decrementUnreadCount,
  setUnreadCountInRedis,
} from '@/app/redis/helpers/notification';
import {
  sendNotificationViaQueue,
  sendPromosionalNotificationViaQueue,
} from '@/app/utils/notification-queue.service';

const PROMOTIONAL_NOTIFICATION_BATCH_SIZE = 500;

// ─── Create ────────────────────────────────────────────────────────────────

const createNotificationIntoDB = async (
  traceId: string,
  payload: INotification
) => {
  await sendNotificationViaQueue({
    userId: payload.receiver.toString(),
    channel: 'both',
    title: payload.message,
    message: payload.description,
    titleArabic: payload.messageArabic,
    messageArabic: payload.descriptionArabic,
    data: {
      modelType: payload.modelType,
      reference: payload.reference,
    },
  });

  return { queued: true, traceId };
};

const sendPromosionalNotificationIntoDB = async (
  traceId: string,
  payload: TPromosionalNotificationPayload
) => {
  const {
    body,
    description,
    bodyArabic,
    descriptionArabic,
    reference = null,
  } = payload;
  const userCursor = getActiveUserCursorForPromotional();

  let totalUsers = 0;
  let totalJobs = 0;
  let batch: string[] = [];

  const flushBatch = async () => {
    if (batch.length === 0) return;

    await sendPromosionalNotificationViaQueue({
      userIds: batch,
      channel: 'both',
      title: body,
      message: description,
      titleArabic: bodyArabic,
      messageArabic: descriptionArabic,
      data: {
        modelType: NOTIFICATION_MODEL_TYPE.Promosional,
        reference,
      },
    });

    totalJobs += 1;
    totalUsers += batch.length;
    batch = [];
  };

  for await (const user of userCursor) {
    batch.push(user._id.toString());
    if (batch.length >= PROMOTIONAL_NOTIFICATION_BATCH_SIZE) {
      await flushBatch();
    }
  }
  await flushBatch();

  if (totalUsers === 0) {
    throw new ApiError(
      HttpStatusCode.NotFound,
      'No active users found to send promotional notification',
      traceId
    );
  }

  return {
    queued: true,
    modelType: NOTIFICATION_MODEL_TYPE.Promosional,
    totalUsers,
    totalJobs,
    batchSize: PROMOTIONAL_NOTIFICATION_BATCH_SIZE,
    traceId,
  };
};

// ─── Read ──────────────────────────────────────────────────────────────────

const getAllNotificationFromDB = async (
  _traceId: string,
  query: Record<string, unknown>
) => {
  const notificationQuery = new QueryBuilder(
    Notification.find().select('-receiver -createdAt -updatedAt -__v'),
    query
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  // Run query and count in parallel
  const [result, meta] = await Promise.all([
    notificationQuery.modelQuery,
    notificationQuery.countTotal(),
  ]);

  return { meta, result };
};

// ─── Update ────────────────────────────────────────────────────────────────

const markAsDoneFromDB = async (_traceId: string, userId: string) => {
  const result = await Notification.updateMany(
    { receiver: userId },
    { $set: { read: true } }
  );

  if (result.modifiedCount > 0) {
    await setUnreadCountInRedis(userId, 0);
  }

  return result;
};

// ─── Delete ────────────────────────────────────────────────────────────────

const deleteANotificationFromDB = async (traceId: string, id: string) => {
  const notification = await Notification.findById(id);
  if (!notification) {
    throw new ApiError(
      HttpStatusCode.NotFound,
      'Notification not found!',
      traceId
    );
  }

  const wasUnread = !notification.read;
  const deleted = await Notification.findByIdAndDelete(id);

  if (wasUnread && deleted) {
    await decrementUnreadCount(notification.receiver!.toString());
  }

  return deleted;
};

const deleteAllNotificationsFromDB = async (
  traceId: string,
  userId: string
) => {
  const [unreadCount, result] = await Promise.all([
    Notification.countDocuments({ receiver: userId, read: false }),
    Notification.deleteMany({ receiver: userId }),
  ]);

  if (result.deletedCount === 0) {
    throw new ApiError(
      HttpStatusCode.NotFound,
      'No notifications found!',
      traceId
    );
  }

  if (unreadCount > 0) {
    await decrementUnreadCount(userId, unreadCount);
  }

  return result;
};

export const NotificationService = {
  createNotificationIntoDB,
  sendPromosionalNotificationIntoDB,
  getAllNotificationFromDB,
  markAsDoneFromDB,
  deleteANotificationFromDB,
  deleteAllNotificationsFromDB,
};


