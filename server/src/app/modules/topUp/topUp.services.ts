import { HttpStatusCode } from 'axios';
import { Types } from 'mongoose';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import {
  assertPaymobConfig,
  buildPaymobBillingData,
  buildPaymobIframeUrl,
  buildPaymobReturnUrl,
  createPaymobOrder,
  createPaymobPaymentKey,
  getPaymobAuthToken,
  payWithPaymobCardToken,
  resolvePaymentStatusFromPaymob,
  toPaymobCents,
} from '@/app/modules/payment/payment.helpers';
import { PAYMENT_STATUS } from '@/app/modules/payment/payment.constant';
import {
  decryptCardToken,
  resolvePaymobMerchantOrderId,
  resolvePaymobOrderId,
  resolvePaymobRedirectUrl,
} from '@/app/modules/savedCard/savedCard.helpers';
import { SavedCardService } from '@/app/modules/savedCard/savedCard.services';
import { TOP_UP_STATUS } from '@/app/modules/topUp/topUp.constant';
import {
  applyTopUpBalanceOnce,
  buildTopUpMerchantOrderId,
  findTopUpByPaymobReference,
  formatTopUpTransaction,
  sumTopUpAmount,
  topUpListPopulate,
} from '@/app/modules/topUp/topUp.helpers';
import { TopUp } from '@/app/modules/topUp/topUp.model';
import { TAddWalletMoneyPayload } from '@/app/modules/topUp/topUp.types';
import { User } from '@/app/modules/user/user.model';
import {
  WALLET_TRANSACTION_DIRECTION,
  WALLET_TRANSACTION_REFERENCE_TYPE,
  WALLET_TRANSACTION_TYPE,
} from '@/app/modules/walletTransaction/walletTransaction.constant';
import { WalletTransactionService } from '@/app/modules/walletTransaction/walletTransaction.services';

const topUpPopulate = topUpListPopulate;

/** Starts a Paymob wallet top-up flow for a new or saved card. */
const addWalletMoney = async (
  traceId: string,
  _userId: string,
  _payload: TAddWalletMoneyPayload
) => {
  throw new ApiError(
    HttpStatusCode.Gone,
    'Customer wallet top-up is disabled. Orders are cash on delivery only.',
    traceId
  );
};

/** Handles Paymob webhook payloads that belong to wallet top-ups. */
const processTopUpWebhook = async (
  traceId: string,
  transaction: Record<string, any>
) => {
  const paymobOrderId = resolvePaymobOrderId(transaction);
  const merchantOrderId = resolvePaymobMerchantOrderId(transaction);
  const topUp = await findTopUpByPaymobReference(paymobOrderId, merchantOrderId);
  if (!topUp) return null;

  if (topUp.isPaid && topUp.balanceAppliedAt) {
    return {
      handled: true,
      topUpId: topUp._id,
      status: topUp.status,
      balanceApplied: false,
    };
  }

  const status = resolvePaymentStatusFromPaymob(transaction);
  const transactionId = transaction?.id ? String(transaction.id) : topUp.transactionId;

  topUp.transactionId = transactionId ?? null;
  topUp.status = status === PAYMENT_STATUS.paid ? TOP_UP_STATUS.paid : TOP_UP_STATUS.failed;
  topUp.isPaid = status === PAYMENT_STATUS.paid;
  await topUp.save();

  if (status !== PAYMENT_STATUS.paid) {
    return { handled: true, topUpId: topUp._id, status: topUp.status };
  }

  if (topUp.saveCardRequested) {
    try {
      await SavedCardService.saveCardFromPaymobTransaction(
        traceId,
        topUp.user.toString(),
        transaction
      );
    } catch {
      // Wallet credit must not fail if Paymob omits tokenization metadata.
    }
  }

  const appliedTopUp = await applyTopUpBalanceOnce(
    topUp._id,
    topUp.user,
    topUp.amount
  );

  if (appliedTopUp) {
    await WalletTransactionService.createWalletTransaction({
      user: topUp.user.toString(),
      type: WALLET_TRANSACTION_TYPE.top_up,
      amount: topUp.amount,
      direction: WALLET_TRANSACTION_DIRECTION.credit,
      referenceType: WALLET_TRANSACTION_REFERENCE_TYPE.TopUp,
      reference: topUp._id.toString(),
      savedCard: topUp.savedCard?.toString() ?? null,
      paymobTransactionId: topUp.transactionId ?? null,
      note: 'Wallet balance credited from top-up',
    });
  }

  return {
    handled: true,
    topUpId: topUp._id,
    status: TOP_UP_STATUS.paid,
    balanceApplied: Boolean(appliedTopUp),
  };
};

/** Returns top-up summary plus paginated top-up transactions. */
const getSummary = async (query: Record<string, unknown>) => {
  const topUpQuery = new QueryBuilder(
    TopUp.find({ isDeleted: false })
      .populate(topUpPopulate)
      .select('-__v')
      .lean(),
    query
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const [totalTopUpReceived, topUpTransctions, meta] = await Promise.all([
    sumTopUpAmount({
      isDeleted: false,
      status: TOP_UP_STATUS.paid,
      isPaid: true,
      balanceAppliedAt: { $ne: null },
    }),
    topUpQuery.modelQuery,
    topUpQuery.countTotal(),
  ]);

  return {
    meta,
    data: {
      totalTopUpReceived,
      topUpTransctions: (topUpTransctions as Record<string, any>[]).map(
        formatTopUpTransaction
      ),
    },
  };
};

/** Returns one top-up transaction details for admin/support review. */
const getDetails = async (traceId: string, topUpId: string) => {
  const idFilter = Types.ObjectId.isValid(topUpId)
    ? { $or: [{ _id: topUpId }, { id: topUpId }] }
    : { id: topUpId };

  const topUp = await TopUp.findOne({
    ...idFilter,
    isDeleted: false,
  })
    .populate(topUpPopulate)
    .select('-__v');

  if (!topUp) {
    throw new ApiError(HttpStatusCode.NotFound, 'Top-up transaction not found', traceId);
  }

  return topUp;
};

export const TopUpService = {
  addWalletMoney,
  processTopUpWebhook,
  getSummary,
  getDetails,
};
