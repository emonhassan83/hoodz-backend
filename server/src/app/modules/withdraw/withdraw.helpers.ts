import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { NOTIFICATION_MODEL_TYPE } from '@/app/modules/notification/notification.constant';
import { USER_ROLE, USER_STATUS } from '@/app/modules/user/user.constant';
import { User } from '@/app/modules/user/user.model';
import { WITHDRAW_STATUS } from '@/app/modules/withdraw/withdraw.constant';
import { Withdraw } from '@/app/modules/withdraw/withdraw.model';
import {
  sendBatchNotificationViaQueue,
  sendBothNotificationViaQueue,
} from '@/app/utils/notification-queue.service';
import { getEmailQueueInstance } from '@/app/utils/queueHelper';

const toIdString = (value: unknown) => String((value as any)?._id ?? value ?? '');

/** Throws when withdraw request does not exist. */
export const assertWithdrawExists = (withdraw: unknown, traceId: string) => {
  if (!withdraw) {
    throw new ApiError(HttpStatusCode.NotFound, 'Withdraw request not found', traceId);
  }
};

/** Returns an active rider for withdraw request creation. */
export const getActiveRiderOrThrow = async (traceId: string, riderId: string) => {
  const rider = await User.findOne({
    _id: riderId,
    role: USER_ROLE.rider,
    status: USER_STATUS.active,
    isDeleted: false,
  });
  if (!rider) {
    throw new ApiError(HttpStatusCode.Forbidden, 'Only active riders can request withdraw', traceId);
  }

  return rider;
};

/** Ensures rider has enough balance at request time. */
export const assertRiderBalanceEnough = (
  traceId: string,
  balance: number,
  amount: number
) => {
  if (balance < amount) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Insufficient earning balance', traceId);
  }
};

/** Prevents too many unresolved withdraw requests for one rider. */
export const assertNoPendingWithdraw = async (traceId: string, riderId: string) => {
  const pending = await Withdraw.exists({
    author: riderId,
    status: 'pending',
    isDeleted: false,
  });
  if (pending) {
    throw new ApiError(
      HttpStatusCode.Conflict,
      'You already have a pending withdraw request',
      traceId
    );
  }
};

export const withdrawListPopulate = [
  { path: 'author', select: 'name profileAvatar' },
];

export const mapWithdrawsToListCards = (withdraws: Array<Record<string, any>>) =>
  withdraws.map((withdraw) => ({
    _id: withdraw._id,
    author: {
      _id: withdraw.author?._id ?? withdraw.author,
      name: withdraw.author?.name ?? null,
      profileAvatar: withdraw.author?.profileAvatar ?? null,
    },
    amount: withdraw.amount,
    status: withdraw.status,
    note: withdraw.note ?? null,
    isDeleted: withdraw.isDeleted ?? false,
    id: withdraw.id,
    createdAt: withdraw.createdAt,
  }));

export const notifyAdminsWithdrawRequested = async (withdraw: {
  _id: unknown;
  id?: string;
  amount?: number;
  author?: unknown;
  note?: string | null;
}) => {
  const admins = await User.find({
    role: USER_ROLE.admin,
    isDeleted: { $ne: true },
  })
    .select('_id')
    .lean();
  const adminIds = admins.map((admin) => admin._id.toString());
  if (!adminIds.length) return;

  await sendBatchNotificationViaQueue({
    userIds: adminIds,
    channel: 'both',
    title: 'New withdraw request',
    message: withdraw.note
      ? `A rider requested a withdraw of ${Number(withdraw.amount ?? 0).toFixed(2)}. Note: ${withdraw.note}`
      : `A rider requested a withdraw of ${Number(withdraw.amount ?? 0).toFixed(2)}.`,
    data: {
      modelType: NOTIFICATION_MODEL_TYPE.Withdraw,
      reference: toIdString(withdraw._id),
      withdrawId: toIdString(withdraw._id),
      withdrawPublicId: withdraw.id,
      riderId: toIdString(withdraw.author),
      note: withdraw.note ?? null,
    },
  }).catch((error) => {
    console.warn('[Withdraw] Failed to notify admins about withdraw request', error);
  });
};

export const notifyRiderWithdrawStatusChanged = async (withdraw: {
  _id: unknown;
  id?: string;
  amount?: number;
  status: string;
  note?: string | null;
  author: unknown;
}) => {
  const riderId = toIdString(withdraw.author);
  if (!riderId || riderId === 'undefined') return;

  const rider = await User.findById(riderId).select('name email fcmToken').lean();
  if (!rider) return;

  const isCompleted = withdraw.status === WITHDRAW_STATUS.completed;
  const noteSuffix = withdraw.note ? ` Note: ${withdraw.note}` : '';
  const title = isCompleted ? 'Withdraw completed' : 'Withdraw rejected';
  const message = isCompleted
    ? `Your withdraw of ${Number(withdraw.amount ?? 0).toFixed(2)} has been completed.${noteSuffix}`
    : `Your withdraw of ${Number(withdraw.amount ?? 0).toFixed(2)} has been rejected.${noteSuffix}`;

  await sendBothNotificationViaQueue(
    riderId,
    rider.fcmToken,
    title,
    message,
    {
      modelType: NOTIFICATION_MODEL_TYPE.Withdraw,
      reference: toIdString(withdraw._id),
      withdrawId: toIdString(withdraw._id),
      withdrawPublicId: withdraw.id,
      status: withdraw.status,
      amount: withdraw.amount,
      note: withdraw.note ?? null,
    }
  ).catch((error) => {
    console.warn('[Withdraw] Failed to notify rider about withdraw status', error);
  });

  if (!rider.email) return;
  const emailQueue = await getEmailQueueInstance();
  await emailQueue
    .add(
      'send-withdraw-status-email',
      {
        email: rider.email,
        name: rider.name ?? 'Rider',
        withdrawId: withdraw.id ?? toIdString(withdraw._id),
        amount: withdraw.amount,
        status: withdraw.status,
        note: withdraw.note ?? null,
      },
      {
        priority: 1,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      }
    )
    .catch((error: unknown) => {
      console.warn('[Withdraw] Failed to queue withdraw status email', error);
    });
};
