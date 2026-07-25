import { HttpStatusCode } from 'axios';
import { Types } from 'mongoose';

import ApiError from '@/app/errors/ApiError';
import { JOB_DEPOSIT_STATUS, JOB_PAYMENT_METHOD } from '@/app/modules/job/job.constant';
import { Job } from '@/app/modules/job/job.model';
import {
  RIDER_WALLET_TRANSACTION_STATUS,
  RIDER_WALLET_TRANSACTION_TYPE,
  WITHDRAW_INTERVAL_DAYS,
} from '@/app/modules/riderWallet/riderWallet.constant';
import { RiderWalletTransaction } from '@/app/modules/riderWallet/riderWallet.model';

/** Sums wallet transactions with a MongoDB aggregation. */
export const sumWalletAmount = async (match: Record<string, unknown>) => {
  const [result] = await RiderWalletTransaction.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  return Number((result?.total ?? 0).toFixed(2));
};

/** Returns wallet balance numbers for one rider. */
export const getWalletNumbers = async (riderId: string) => {
  const [
    availableEarnings,
    pendingWithdraw,
    paidWithdraw,
    pendingEarnings,
    pendingDepositAmount,
  ] =
    await Promise.all([
      sumWalletAmount({
        rider: riderId,
        type: RIDER_WALLET_TRANSACTION_TYPE.earning,
        status: RIDER_WALLET_TRANSACTION_STATUS.available,
      }),
      sumWalletAmount({
        rider: riderId,
        type: RIDER_WALLET_TRANSACTION_TYPE.withdraw,
        status: RIDER_WALLET_TRANSACTION_STATUS.pending,
      }),
      sumWalletAmount({
        rider: riderId,
        type: RIDER_WALLET_TRANSACTION_TYPE.withdraw,
        status: RIDER_WALLET_TRANSACTION_STATUS.paid,
      }),
      sumWalletAmount({
        rider: riderId,
        type: RIDER_WALLET_TRANSACTION_TYPE.earning,
        status: RIDER_WALLET_TRANSACTION_STATUS.pending,
      }),
      Job.aggregate([
        {
          $match: {
            rider: new Types.ObjectId(riderId),
            paymentMethod: JOB_PAYMENT_METHOD.cod,
            depositStatus: {
              $in: [
                JOB_DEPOSIT_STATUS.pending,
                JOB_DEPOSIT_STATUS.submitted,
              ],
            },
          },
        },
        { $group: { _id: null, total: { $sum: '$collectedMoney' } } },
      ]).then((result) => Number((result[0]?.total ?? 0).toFixed(2))),
    ]);

  return {
    totalEarnings: Number((availableEarnings + pendingEarnings).toFixed(2)),
    availableBalance: Number((availableEarnings - pendingWithdraw).toFixed(2)),
    pendingWithdraw,
    withdrawnAmount: paidWithdraw,
    pendingEarnings,
    pendingDepositAmount,
  };
};

/** Throws when rider requests withdraw too soon or over available balance. */
export const assertWithdrawAllowed = async (
  riderId: string,
  amount: number,
  traceId: string
) => {
  const wallet = await getWalletNumbers(riderId);
  if (amount <= 0 || amount > wallet.availableBalance) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Insufficient wallet balance', traceId);
  }

  const lastWithdraw = await RiderWalletTransaction.findOne({
    rider: riderId,
    type: RIDER_WALLET_TRANSACTION_TYPE.withdraw,
    status: { $in: [RIDER_WALLET_TRANSACTION_STATUS.pending, RIDER_WALLET_TRANSACTION_STATUS.paid] },
  })
    .sort({ createdAt: -1 })
    .select('createdAt')
    .lean();

  if (lastWithdraw) {
    const nextAllowedAt = new Date(lastWithdraw.createdAt);
    nextAllowedAt.setDate(nextAllowedAt.getDate() + WITHDRAW_INTERVAL_DAYS);
    if (nextAllowedAt > new Date()) {
      throw new ApiError(
        HttpStatusCode.BadRequest,
        `Withdraw request is available after ${nextAllowedAt.toISOString()}`,
        traceId
      );
    }
  }
};

/** Calculates next withdraw date from rider's last withdraw record. */
export const getNextWithdrawDate = async (riderId: string) => {
  const lastWithdraw = await RiderWalletTransaction.findOne({
    rider: riderId,
    type: RIDER_WALLET_TRANSACTION_TYPE.withdraw,
  })
    .sort({ createdAt: -1 })
    .select('createdAt')
    .lean();

  if (!lastWithdraw) return null;
  const nextWithdrawDate = new Date(lastWithdraw.createdAt);
  nextWithdrawDate.setDate(nextWithdrawDate.getDate() + WITHDRAW_INTERVAL_DAYS);
  return nextWithdrawDate;
};

/** Emits wallet summary to a rider when socket.io is available. */
export const emitWalletSummaryIfAvailable = async (riderId: string) => {
  const io = (global as any)?.socketio;
  if (!io) return;

  io.to(riderId).emit('wallet:updated', await getWalletNumbers(riderId));
};

