import { HttpStatusCode } from 'axios';
import mongoose from 'mongoose';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import { getRiderMoneySummary } from '@/app/modules/deposit/deposit.helpers';
import { formatKycWallet } from '@/app/modules/kyc/kyc.helpers';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import { User } from '@/app/modules/user/user.model';
import { WalletAccount } from '@/app/modules/wallet/wallet.model';
import {
  WALLET_TRANSACTION_DIRECTION,
  WALLET_TRANSACTION_REFERENCE_TYPE,
  WALLET_TRANSACTION_TYPE,
} from '@/app/modules/walletTransaction/walletTransaction.constant';
import { WalletTransactionService } from '@/app/modules/walletTransaction/walletTransaction.services';
import { WITHDRAW_STATUS } from '@/app/modules/withdraw/withdraw.constant';
import {
  assertNoPendingWithdraw,
  assertRiderBalanceEnough,
  assertWithdrawExists,
  getActiveRiderOrThrow,
  mapWithdrawsToListCards,
  notifyAdminsWithdrawRequested,
  notifyRiderWithdrawStatusChanged,
  withdrawListPopulate,
} from '@/app/modules/withdraw/withdraw.helpers';
import { Withdraw } from '@/app/modules/withdraw/withdraw.model';
import {
  TAddWithdrawPayload,
  TChangeWithdrawStatusPayload,
  TWithdrawRequester,
} from '@/app/modules/withdraw/withdraw.types';

const withdrawPopulate = [
  { path: 'author', select: 'name email phone profileAvatar balance role status' },
  { path: 'processedBy', select: 'name email role profileAvatar' },
];

/** Creates a rider withdraw request in pending state. */
const addWithdrawRequest = async (
  traceId: string,
  riderId: string,
  payload: TAddWithdrawPayload
) => {
  const rider = await getActiveRiderOrThrow(traceId, riderId);
  assertRiderBalanceEnough(traceId, rider.balance ?? 0, payload.amount);
  await assertNoPendingWithdraw(traceId, riderId);

  const withdraw = await Withdraw.create({
    author: riderId,
    amount: payload.amount,
    note: payload.note ?? null,
  });

  const created = await Withdraw.findById(withdraw._id)
    .populate(withdrawPopulate)
    .select('-__v');
  await notifyAdminsWithdrawRequested(created ?? withdraw);
  return created;
};

/** Returns paginated withdraw requests for admins. */
const getAllWithdraws = async (query: Record<string, unknown>) => {
  const withdrawQuery = new QueryBuilder(
    Withdraw.find({ isDeleted: false })
      .populate(withdrawListPopulate)
      .select('_id author amount status note isDeleted id createdAt')
      .lean(),
    query
  )
    .filter()
    .sort()
    .paginate();

  const [withdraws, meta] = await Promise.all([
    withdrawQuery.modelQuery,
    withdrawQuery.countTotal(),
  ]);

  return { meta, data: mapWithdrawsToListCards(withdraws as any) };
};

/** Returns paginated withdraw requests for logged-in rider. */
const myWithdraws = async (
  riderId: string,
  query: Record<string, unknown>
) => {
  const withdrawQuery = new QueryBuilder(
    Withdraw.find({ author: riderId, isDeleted: false })
      .populate(withdrawListPopulate)
      .select('_id author amount status note isDeleted id createdAt')
      .lean(),
    query
  )
    .filter()
    .sort()
    .paginate();

  const [withdraws, meta, summary] = await Promise.all([
    withdrawQuery.modelQuery,
    withdrawQuery.countTotal(),
    getRiderMoneySummary(riderId),
  ]);

  return {
    meta,
    data: {
      earning: summary.earning,
      balance: summary.balance,
      collectedMoney: summary.collectedMoney,
      withdraws: mapWithdrawsToListCards(withdraws as any),
    },
  };
};

/** Returns one withdraw after role-based access check. */
const getAWithdraw = async (
  traceId: string,
  withdrawId: string,
  requester: TWithdrawRequester
) => {
  const withdraw = await Withdraw.findOne({ _id: withdrawId, isDeleted: false })
    .populate(withdrawPopulate)
    .select('-__v')
    .lean();
  assertWithdrawExists(withdraw, traceId);

  const authorId = String(
    (withdraw!.author as any)?._id ?? withdraw!.author ?? ''
  );

  if (requester.role !== USER_ROLE.admin && authorId !== requester.userId) {
    throw new ApiError(
      HttpStatusCode.Forbidden,
      'You are not allowed to view this withdraw request',
      traceId
    );
  }

  const wallets = await WalletAccount.find({ user: authorId })
    .select('-__v -user')
    .lean();

  return {
    ...withdraw,
    riderWallet: (wallets as Record<string, any>[]).map(formatKycWallet),
  };
};

/** Admin completes/rejects a pending withdraw with balance-safe deduction. */
const changedWithdrawStatus = async (
  traceId: string,
  withdrawId: string,
  adminId: string,
  payload: TChangeWithdrawStatusPayload
) => {
  const withdraw = await Withdraw.findOne({ _id: withdrawId, isDeleted: false });
  assertWithdrawExists(withdraw, traceId);

  if (withdraw!.status !== WITHDRAW_STATUS.pending) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Only pending withdraw request can be updated',
      traceId
    );
  }

  if (payload.status === WITHDRAW_STATUS.pending) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Withdraw status is already pending',
      traceId
    );
  }

  if (payload.status === WITHDRAW_STATUS.rejected) {
    withdraw!.status = WITHDRAW_STATUS.rejected;
    withdraw!.note = payload.note ?? withdraw!.note ?? null;
    withdraw!.files = payload.files ?? [];
    withdraw!.processedBy = new mongoose.Types.ObjectId(adminId);
    withdraw!.rejectedAt = new Date();
    await withdraw!.save();

    const rejected = await Withdraw.findById(withdraw!._id)
      .populate(withdrawPopulate)
      .select('-__v');
    await notifyRiderWithdrawStatusChanged(rejected ?? withdraw);
    return rejected;
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const currentWithdraw = await Withdraw.findOne({
      _id: withdrawId,
      status: WITHDRAW_STATUS.pending,
      isDeleted: false,
    }).session(session);
    assertWithdrawExists(currentWithdraw, traceId);

    const updatedRider = await User.findOneAndUpdate(
      {
        _id: currentWithdraw!.author,
        balance: { $gte: currentWithdraw!.amount },
      },
      {
        $inc: {
          balance: -currentWithdraw!.amount,
        },
      },
      { new: true, session }
    );
    if (!updatedRider) {
      throw new ApiError(
        HttpStatusCode.BadRequest,
        'Rider earning balance is not enough to complete this withdraw',
        traceId
      );
    }

    currentWithdraw!.status = WITHDRAW_STATUS.completed;
    currentWithdraw!.note = payload.note ?? currentWithdraw!.note ?? null;
    currentWithdraw!.files = payload.files ?? [];
    currentWithdraw!.processedBy = new mongoose.Types.ObjectId(adminId);
    currentWithdraw!.completedAt = new Date();
    await currentWithdraw!.save({ session });

    await session.commitTransaction();

    await WalletTransactionService.createWalletTransaction({
      user: currentWithdraw!.author.toString(),
      type: WALLET_TRANSACTION_TYPE.withdraw,
      amount: currentWithdraw!.amount,
      direction: WALLET_TRANSACTION_DIRECTION.debit,
      referenceType: WALLET_TRANSACTION_REFERENCE_TYPE.Withdraw,
      reference: currentWithdraw!._id.toString(),
      note: 'Withdraw completed by admin',
    });

    const completed = await Withdraw.findById(currentWithdraw!._id)
      .populate(withdrawPopulate)
      .select('-__v');
    await notifyRiderWithdrawStatusChanged(completed ?? currentWithdraw);
    return completed;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

export const WithdrawService = {
  addWithdrawRequest,
  getAllWithdraws,
  myWithdraws,
  getAWithdraw,
  changedWithdrawStatus,
};
