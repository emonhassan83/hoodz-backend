import { HttpStatusCode } from 'axios';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import { User } from '@/app/modules/user/user.model';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import { WALLET_TRANSACTION_STATUS } from '@/app/modules/walletTransaction/walletTransaction.constant';
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

/** Card refunds are off while orders are cash on delivery only. */
const refundToCard = async (
  traceId: string,
  _userId: string,
  _payload: TRefundToCardPayload
) => {
  throw new ApiError(
    HttpStatusCode.Gone,
    'Refund to card is disabled. Orders are cash on delivery only.',
    traceId
  );
};

export const WalletTransactionService = {
  createWalletTransaction,
  getAllIntoDB,
  getAIntoDB,
  refundToCard,
};
