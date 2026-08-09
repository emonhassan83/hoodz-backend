import { HttpStatusCode } from 'axios';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import { INotification } from '@/app/modules/notification/notification.interface';
import { Notification } from '@/app/modules/notification/notification.model';
import { User } from '@/app/modules/user/user.model';
import {
  decrementUnreadCount,
  setUnreadCountInRedis,
} from '@/app/redis/helpers/notification';
import {
  sendBatchNotificationViaQueue,
  sendNotificationViaQueue,
} from '@/app/utils/notification-queue.service';

const GENERAL_NOTIFICATION_BATCH_SIZE = 500;

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
    data: {
      modelType: payload.modelType,
      reference: payload.reference,
    },
  });

  return { queued: true, traceId };
};

const sendGeneralNotificationIntoDB = async (
  traceId: string,
  payload: INotification & { roles?: string[]; role?: string }
) => {
  const {
    message,
    description,
    receiver: _originalReceiver,
    roles,
    role,
    ...rest
  } = payload;
  const targetRoles = roles?.length ? roles : role ? [role] : ['user'];
  const userCursor = User.find({
    role: { $in: targetRoles as any },
    isDeleted: false,
  })
    .select('_id')
    .lean()
    .cursor();

  let totalUsers = 0;
  let totalJobs = 0;
  let batch: string[] = [];

  const flushBatch = async () => {
    if (batch.length === 0) return;

    await sendBatchNotificationViaQueue({
      userIds: batch,
      channel: 'both',
      title: message,
      message: description,
      data: {
        modelType: rest.modelType,
        reference: rest.reference,
      },
    });

    totalJobs += 1;
    totalUsers += batch.length;
    batch = [];
  };

  for await (const user of userCursor) {
    batch.push(user._id.toString());
    if (batch.length >= GENERAL_NOTIFICATION_BATCH_SIZE) {
      await flushBatch();
    }
  }
  await flushBatch();

  return {
    queued: true,
    roles: targetRoles,
    totalUsers,
    totalJobs,
    batchSize: GENERAL_NOTIFICATION_BATCH_SIZE,
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
  sendGeneralNotificationIntoDB,
  getAllNotificationFromDB,
  markAsDoneFromDB,
  deleteANotificationFromDB,
  deleteAllNotificationsFromDB,
};


