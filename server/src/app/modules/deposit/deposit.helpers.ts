import { HttpStatusCode } from 'axios';
import mongoose from 'mongoose';

import ApiError from '@/app/errors/ApiError';
import { DEPOSIT_STATUS } from '@/app/modules/deposit/deposit.constant';
import { Deposit } from '@/app/modules/deposit/deposit.model';
import {
  JOB_DEPOSIT_STATUS,
  JOB_PAYMENT_METHOD,
  JOB_STATUS,
} from '@/app/modules/job/job.constant';
import { Job } from '@/app/modules/job/job.model';
import { User } from '@/app/modules/user/user.model';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import { TDepositRequester } from '@/app/modules/deposit/deposit.types';
import { NOTIFICATION_MODEL_TYPE } from '@/app/modules/notification/notification.constant';
import {
  sendBatchNotificationViaQueue,
  sendBothNotificationViaQueue,
} from '@/app/utils/notification-queue.service';

export const depositPopulate = [
  { path: 'author', select: 'name email phone profileAvatar' },
  { path: 'jobIds', select: 'id status collectedMoney earning order rider paymentMethod' },
];

export const depositListPopulate = [
  { path: 'author', select: 'name profileAvatar' },
];

const toIdString = (value: unknown) => String((value as any)?._id ?? value ?? '');

export const mapDepositsToListCards = (deposits: Array<Record<string, any>>) =>
  deposits.map((deposit) => ({
    _id: deposit._id,
    author: {
      _id: deposit.author?._id ?? deposit.author,
      name: deposit.author?.name ?? null,
      profileAvatar: deposit.author?.profileAvatar ?? null,
    },
    jobIds: (deposit.jobIds ?? []).map((jobId: unknown) => toIdString(jobId)),
    amount: deposit.amount,
    fawryRefNo: deposit.fawryRefNo,
    receiptFiles: deposit.receiptFiles ?? [],
    status: deposit.status,
    note: deposit.note ?? null,
    id: deposit.id,
    createdAt: deposit.createdAt,
    updatedAt: deposit.updatedAt,
  }));

const getUserIdsByRoles = async (roles: string[]) => {
  const users = await User.find({
    role: { $in: roles as any },
    isDeleted: { $ne: true },
  })
    .select('_id')
    .lean();
  return users.map((user) => user._id.toString());
};

export const notifyAgentsDepositSubmitted = async (deposit: {
  _id: unknown;
  id?: string;
  amount?: number;
  author?: unknown;
}) => {
  const agentIds = await getUserIdsByRoles([USER_ROLE.agent]);
  if (!agentIds.length) return;

  await sendBatchNotificationViaQueue({
    userIds: agentIds,
    channel: 'both',
    title: 'New COD deposit submitted',
    message: `A rider submitted a deposit of ${Number(deposit.amount ?? 0).toFixed(2)}.`,
    data: {
      modelType: NOTIFICATION_MODEL_TYPE.Deposit,
      reference: toIdString(deposit._id),
      depositId: toIdString(deposit._id),
      depositPublicId: deposit.id,
      riderId: toIdString(deposit.author),
    },
  }).catch((error) => {
    console.warn('[Deposit] Failed to notify agents about deposit submit', error);
  });
};

export const notifyRiderDepositVerified = async (deposit: {
  _id: unknown;
  id?: string;
  amount?: number;
  status: string;
  note?: string | null;
  author: unknown;
}) => {
  const riderId = toIdString(deposit.author);
  if (!riderId || riderId === 'undefined') return;

  const rider = await User.findById(riderId).select('fcmToken').lean();
  const isCompleted = deposit.status === DEPOSIT_STATUS.completed;
  const noteSuffix = deposit.note ? ` Note: ${deposit.note}` : '';

  await sendBothNotificationViaQueue(
    riderId,
    rider?.fcmToken ?? '',
    isCompleted ? 'Deposit verified' : 'Deposit rejected',
    isCompleted
      ? `Your deposit of ${Number(deposit.amount ?? 0).toFixed(2)} has been verified.${noteSuffix}`
      : `Your deposit of ${Number(deposit.amount ?? 0).toFixed(2)} was rejected.${noteSuffix}`,
    {
      modelType: NOTIFICATION_MODEL_TYPE.Deposit,
      reference: toIdString(deposit._id),
      depositId: toIdString(deposit._id),
      depositPublicId: deposit.id,
      status: deposit.status,
      note: deposit.note ?? null,
    }
  ).catch((error) => {
    console.warn('[Deposit] Failed to notify rider about deposit verify', error);
  });
};

export const assertDepositAccess = (
  traceId: string,
  deposit: { author?: { _id?: unknown } | unknown },
  requester: TDepositRequester
) => {
  const authorId = String((deposit.author as any)?._id ?? deposit.author ?? '');
  const canAccess =
    requester.role === USER_ROLE.admin || authorId === requester.userId;
  if (!canAccess) {
    throw new ApiError(HttpStatusCode.Forbidden, 'You cannot access this deposit', traceId);
  }
};

/** Returns COD delivered jobs for deposit submission or throws. */
export const getDepositableJobsOrThrow = async (
  traceId: string,
  jobIds: string[],
  riderId: string
) => {
  const uniqueJobIds = [...new Set(jobIds)];
  if (uniqueJobIds.length !== jobIds.length) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Duplicate job ids are not allowed', traceId);
  }

  const jobs = await Job.find({ _id: { $in: uniqueJobIds } });
  if (jobs.length !== uniqueJobIds.length) {
    throw new ApiError(HttpStatusCode.NotFound, 'One or more jobs were not found', traceId);
  }

  jobs.forEach((job) => {
    if (!job.rider || job.rider.toString() !== riderId) {
      throw new ApiError(HttpStatusCode.Forbidden, 'You can only deposit your own COD jobs', traceId);
    }
    if (job.status !== JOB_STATUS.delivered || job.paymentMethod !== JOB_PAYMENT_METHOD.cod) {
      throw new ApiError(HttpStatusCode.BadRequest, 'Only delivered COD jobs require deposit', traceId);
    }
    if (
      job.depositStatus &&
      job.depositStatus !== JOB_DEPOSIT_STATUS.pending &&
      job.depositStatus !== JOB_DEPOSIT_STATUS.not_required
    ) {
      throw new ApiError(
        HttpStatusCode.BadRequest,
        'This COD job is already submitted or deposited',
        traceId
      );
    }
  });

  const existingDeposit = await Deposit.findOne({
    jobIds: { $in: uniqueJobIds },
    status: { $ne: 'rejected' },
  });
  if (existingDeposit) {
    throw new ApiError(
      HttpStatusCode.Conflict,
      'One or more jobs already have a pending or completed deposit',
      traceId
    );
  }

  return jobs;
};

/** Returns one deposit document or throws. */
export const getDepositOrThrow = async (
  traceId: string,
  depositId: string
) => {
  const deposit = await Deposit.findById(depositId);
  if (!deposit) {
    throw new ApiError(HttpStatusCode.NotFound, 'Deposit not found', traceId);
  }
  return deposit;
};

/** Total delivered-job earning, remaining user balance, and undeposited COD cash. */
export const getRiderMoneySummary = async (riderId: string) => {
  const riderObjectId = new mongoose.Types.ObjectId(riderId);
  const [rider, collected, earnings] = await Promise.all([
    User.findById(riderId).select('balance').lean(),
    Job.aggregate<{ total: number }>([
      {
        $match: {
          rider: riderObjectId,
          paymentMethod: JOB_PAYMENT_METHOD.cod,
          status: JOB_STATUS.delivered,
          depositStatus: {
            $nin: [JOB_DEPOSIT_STATUS.verified],
          },
        },
      },
      { $group: { _id: null, total: { $sum: '$collectedMoney' } } },
    ]),
    Job.aggregate<{ total: number }>([
      {
        $match: {
          rider: riderObjectId,
          status: JOB_STATUS.delivered,
        },
      },
      { $group: { _id: null, total: { $sum: '$earning' } } },
    ]),
  ]);

  return {
    earning: Number((earnings[0]?.total ?? 0).toFixed(2)),
    balance: Number((rider?.balance ?? 0).toFixed(2)),
    collectedMoney: Number((collected[0]?.total ?? 0).toFixed(2)),
  };
};


