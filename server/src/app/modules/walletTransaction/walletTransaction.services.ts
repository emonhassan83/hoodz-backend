import { HttpStatusCode } from 'axios';
import mongoose from 'mongoose';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import {
  assertPaymobConfig,
  getPaymobAuthToken,
  refundPaymobTransaction,
  toPaymobCents,
} from '@/app/modules/payment/payment.helpers';
import { SavedCard } from '@/app/modules/savedCard/savedCard.model';
import { TopUp } from '@/app/modules/topUp/topUp.model';
import { User } from '@/app/modules/user/user.model';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import {
  WALLET_TRANSACTION_DIRECTION,
  WALLET_TRANSACTION_REFERENCE_TYPE,
  WALLET_TRANSACTION_STATUS,
  WALLET_TRANSACTION_TYPE,
} from '@/app/modules/walletTransaction/walletTransaction.constant';
import { assertWalletTransactionAccess } from '@/app/modules/walletTransaction/walletTransaction.helpers';
import { WalletTransaction } from '@/app/modules/walletTransaction/walletTransaction.model';
import {
  TCreateWalletTransactionPayload,
  TRefundToCardPayload,
  TWalletTransactionRequester,
} from '@/app/modules/walletTransaction/walletTransaction.types';

const walletTransactionPopulate = [
  { path: 'user', select: 'name email phone profileAvatar walletBalance balance' },
  { path: 'savedCard', select: 'maskedPan last4 cardBrand cardSubType isDefault' },
];

/** Creates a wallet ledger row once for a reference. */
const createWalletTransaction = async (
  payload: TCreateWalletTransactionPayload
) =>
  WalletTransaction.findOneAndUpdate(
    {
      user: payload.user,
      type: payload.type,
      referenceType: payload.referenceType ?? null,
      reference: payload.reference ?? null,
      isDeleted: false,
    },
    {
      user: payload.user,
      type: payload.type,
      amount: payload.amount,
      direction: payload.direction,
      status: payload.status ?? WALLET_TRANSACTION_STATUS.completed,
      referenceType: payload.referenceType ?? null,
      reference: payload.reference ?? null,
      savedCard: payload.savedCard ?? null,
      paymobTransactionId: payload.paymobTransactionId ?? null,
      note: payload.note ?? null,
      isDeleted: false,
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

/** Returns paginated wallet transactions for user/admin. */
const getAllIntoDB = async (
  query: Record<string, unknown>,
  requester: TWalletTransactionRequester
) => {
  const filter =
    requester.role === USER_ROLE.admin
      ? { isDeleted: false }
      : { user: requester.userId, isDeleted: false };

  const transactionQuery = new QueryBuilder(
    WalletTransaction.find(filter)
      .populate(walletTransactionPopulate)
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

/** Returns one wallet transaction after access verification. */
const getAIntoDB = async (
  traceId: string,
  transactionId: string,
  requester: TWalletTransactionRequester
) => {
  const transaction = await WalletTransaction.findOne({
    _id: transactionId,
    isDeleted: false,
  })
    .populate(walletTransactionPopulate)
    .select('-__v');
  if (!transaction) {
    throw new ApiError(
      HttpStatusCode.NotFound,
      'Wallet transaction not found',
      traceId
    );
  }

  assertWalletTransactionAccess(traceId, transaction, requester);
  return transaction;
};

/** Refunds wallet credit back to the selected saved card when Paymob allows it. */
const refundToCard = async (
  traceId: string,
  userId: string,
  payload: TRefundToCardPayload
) => {
  assertPaymobConfig(traceId);

  const savedCard = await SavedCard.findOne({
    _id: payload.savedCardId,
    user: userId,
    isDeleted: false,
  });
  if (!savedCard) {
    throw new ApiError(HttpStatusCode.NotFound, 'Saved card not found', traceId);
  }

  const sourceTopUp = await TopUp.findOne({
    user: userId,
    savedCard: payload.savedCardId,
    isPaid: true,
    transactionId: { $ne: null },
    isDeleted: false,
  }).sort({ createdAt: -1 });
  if (!sourceTopUp?.transactionId) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'No refundable Paymob card transaction found for this saved card',
      traceId
    );
  }

  const session = await mongoose.startSession();
  let pendingTransactionId: mongoose.Types.ObjectId | null = null;
  let sessionEnded = false;
  try {
    session.startTransaction();

    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new ApiError(HttpStatusCode.NotFound, 'User not found', traceId);
    }

    if ((user.walletBalance ?? 0) < payload.amount) {
      throw new ApiError(
        HttpStatusCode.BadRequest,
        'Insufficient wallet balance',
        traceId
      );
    }

    const pendingTransaction = await WalletTransaction.create(
      [
        {
          user: userId,
          type: WALLET_TRANSACTION_TYPE.refund_to_card,
          amount: payload.amount,
          direction: WALLET_TRANSACTION_DIRECTION.debit,
          status: WALLET_TRANSACTION_STATUS.pending,
          referenceType: WALLET_TRANSACTION_REFERENCE_TYPE.TopUp,
          reference: sourceTopUp._id,
          savedCard: payload.savedCardId,
          paymobTransactionId: sourceTopUp.transactionId,
          note: 'Wallet refund to saved card requested',
        },
      ],
      { session }
    );
    pendingTransactionId = pendingTransaction[0]._id;

    await session.commitTransaction();
    await session.endSession();
    sessionEnded = true;

    const authToken = await getPaymobAuthToken();
    const refund = await refundPaymobTransaction(
      authToken,
      sourceTopUp.transactionId,
      toPaymobCents(payload.amount)
    );

    const debitSession = await mongoose.startSession();
    try {
      debitSession.startTransaction();

      const updatedUser = await User.findOneAndUpdate(
        { _id: userId, walletBalance: { $gte: payload.amount } },
        { $inc: { walletBalance: -payload.amount, balance: -payload.amount } },
        { new: true, session: debitSession }
      );
      if (!updatedUser) {
        throw new ApiError(
          HttpStatusCode.BadRequest,
          'Insufficient wallet balance',
          traceId
        );
      }

      const transaction = await WalletTransaction.findByIdAndUpdate(
        pendingTransaction[0]._id,
        {
          status: WALLET_TRANSACTION_STATUS.completed,
          paymobTransactionId: String(refund?.id ?? sourceTopUp.transactionId),
          note: 'Wallet refund to card completed',
        },
        { new: true, session: debitSession }
      ).populate(walletTransactionPopulate);

      await debitSession.commitTransaction();
      return { transaction, refund };
    } catch (error) {
      await debitSession.abortTransaction();
      throw error;
    } finally {
      await debitSession.endSession();
    }
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    if (!sessionEnded) await session.endSession();
    if (pendingTransactionId) {
      await WalletTransaction.findByIdAndUpdate(pendingTransactionId, {
        status: WALLET_TRANSACTION_STATUS.failed,
        note: error instanceof Error ? error.message : 'Wallet refund to card failed',
      });
    }
    throw error;
  }
};

export const WalletTransactionService = {
  createWalletTransaction,
  getAllIntoDB,
  getAIntoDB,
  refundToCard,
};
