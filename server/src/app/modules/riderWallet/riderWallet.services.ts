import { HttpStatusCode } from 'axios';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import {
  RIDER_WALLET_TRANSACTION_STATUS,
  RIDER_WALLET_TRANSACTION_TYPE,
} from '@/app/modules/riderWallet/riderWallet.constant';
import {
  assertWithdrawAllowed,
  getNextWithdrawDate,
  getWalletNumbers,
} from '@/app/modules/riderWallet/riderWallet.helpers';
import { RiderWalletTransaction } from '@/app/modules/riderWallet/riderWallet.model';
import {
  TRejectWithdrawPayload,
  TRiderWalletRequester,
  TWithdrawRequestPayload,
} from '@/app/modules/riderWallet/riderWallet.types';

/** Returns rider wallet summary for dashboard. */
const getSummary = async (riderId: string) => ({
  ...(await getWalletNumbers(riderId)),
  nextWithdrawDate: await getNextWithdrawDate(riderId),
});

/** Returns paginated rider wallet ledger. */
const getTransactions = async (
  riderId: string,
  query: Record<string, unknown>
) => {
  const transactionQuery = new QueryBuilder(
    RiderWalletTransaction.find({ rider: riderId })
      .populate([{ path: 'job', select: 'id status' }])
      .select('-__v')
      .lean(),
    query
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const [data, meta] = await Promise.all([
    transactionQuery.modelQuery,
    transactionQuery.countTotal(),
  ]);

  return { meta, data };
};

/** Creates a rider withdraw request after the 14-day rule and balance check. */
const createWithdrawRequest = async (
  traceId: string,
  riderId: string,
  payload: TWithdrawRequestPayload
) => {
  await assertWithdrawAllowed(riderId, payload.amount, traceId);

  return RiderWalletTransaction.create({
    rider: riderId,
    type: RIDER_WALLET_TRANSACTION_TYPE.withdraw,
    amount: payload.amount,
    status: RIDER_WALLET_TRANSACTION_STATUS.pending,
    note: payload.note ?? null,
    createdBy: riderId,
  });
};

/** Admin marks a withdraw request paid. */
const approveWithdraw = async (
  traceId: string,
  requester: TRiderWalletRequester,
  withdrawId: string
) => {
  const withdraw = await RiderWalletTransaction.findOne({
    _id: withdrawId,
    type: RIDER_WALLET_TRANSACTION_TYPE.withdraw,
  });
  if (!withdraw) {
    throw new ApiError(HttpStatusCode.NotFound, 'Withdraw request not found', traceId);
  }

  withdraw.status = RIDER_WALLET_TRANSACTION_STATUS.paid;
  withdraw.createdBy = requester.userId as any;
  await withdraw.save();
  return withdraw;
};

/** Admin rejects a withdraw request with a reason. */
const rejectWithdraw = async (
  traceId: string,
  requester: TRiderWalletRequester,
  withdrawId: string,
  payload: TRejectWithdrawPayload
) => {
  const withdraw = await RiderWalletTransaction.findOne({
    _id: withdrawId,
    type: RIDER_WALLET_TRANSACTION_TYPE.withdraw,
  });
  if (!withdraw) {
    throw new ApiError(HttpStatusCode.NotFound, 'Withdraw request not found', traceId);
  }

  withdraw.status = RIDER_WALLET_TRANSACTION_STATUS.rejected;
  withdraw.rejectionReason = payload.reason;
  withdraw.createdBy = requester.userId as any;
  await withdraw.save();
  return withdraw;
};

/** Creates a one-time earning ledger entry for a delivered job. */
const createJobEarning = async (
  riderId: string,
  jobId: string,
  amount: number
) => {
  return RiderWalletTransaction.findOneAndUpdate(
    {
      rider: riderId,
      job: jobId,
      type: RIDER_WALLET_TRANSACTION_TYPE.earning,
    },
    {
      rider: riderId,
      job: jobId,
      type: RIDER_WALLET_TRANSACTION_TYPE.earning,
      amount,
      status: RIDER_WALLET_TRANSACTION_STATUS.available,
      availableAt: new Date(),
      note: 'Delivery earning',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

export const RiderWalletService = {
  getSummary,
  getTransactions,
  createWithdrawRequest,
  approveWithdraw,
  rejectWithdraw,
  createJobEarning,
};


