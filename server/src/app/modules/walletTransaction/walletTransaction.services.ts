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
import { SavedCardService } from '@/app/modules/savedCard/savedCard.services';
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
  { path: 'user', select: 'name email phone profileAvatar walletBalance' },
  { path: 'savedCard', select: 'maskedPan last4 cardBrand cardSubType isDefault' },
];

/** Formats one wallet ledger row for list responses. */
const formatWalletTransaction = (transaction: Record<string, any>) => ({
  _id: transaction._id,
  referenceType: transaction.referenceType ?? null,
  type: transaction.type,
  reference: transaction.reference ?? null,
  amount: transaction.amount,
  createdAt: transaction.createdAt,
  direction: transaction.direction,
  id: transaction.id,
  note: transaction.note ?? null,
  paymobTransactionId: transaction.paymobTransactionId ?? null,
  savedCard: transaction.savedCard ?? null,
  status: transaction.status,
});

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

/** Returns wallet balance and paginated ledger rows for user/admin. */
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
      .select(
        '_id id type amount direction status referenceType reference savedCard paymobTransactionId note createdAt'
      )
      .lean(),
    query
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const [transactions, meta, user] = await Promise.all([
    transactionQuery.modelQuery,
    transactionQuery.countTotal(),
    User.findById(requester.userId).select('walletBalance').lean(),
  ]);

  return {
    meta,
    data: {
      walletBalance: Number((user?.walletBalance ?? 0).toFixed(2)),
      transactions: (transactions as Record<string, any>[]).map(
        formatWalletTransaction
      ),
    },
  };
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
    .select('-__v')
    .lean();
  if (!transaction) {
    throw new ApiError(
      HttpStatusCode.NotFound,
      'Wallet transaction not found',
      traceId
    );
  }

  assertWalletTransactionAccess(traceId, transaction, requester);
  return formatWalletTransaction(transaction);
};

/** Refunds wallet credit only to a user-owned saved card via Paymob. */
const refundToCard = async (
  traceId: string,
  userId: string,
  payload: TRefundToCardPayload
) => {
  assertPaymobConfig(traceId);

  await SavedCardService.getUsableCardById(
    traceId,
    userId,
    payload.savedCardId
  );

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
      'Refund to card requires a paid top-up on this saved card. Random or unsaved cards are not supported',
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
        { $inc: { walletBalance: -payload.amount } },
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
