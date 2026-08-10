import { HttpStatusCode } from 'axios';

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
  assertTopUpAccess,
  buildTopUpMerchantOrderId,
  findTopUpByPaymobReference,
} from '@/app/modules/topUp/topUp.helpers';
import { TopUp } from '@/app/modules/topUp/topUp.model';
import {
  TAddWalletMoneyPayload,
  TTopUpRequester,
} from '@/app/modules/topUp/topUp.types';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import { User } from '@/app/modules/user/user.model';

const topUpPopulate = [
  { path: 'user', select: 'name email phone profileAvatar walletBalance balance' },
  { path: 'savedCard', select: 'maskedPan last4 cardBrand cardSubType isDefault' },
];

/** Starts a Paymob wallet top-up flow for a new or saved card. */
const addWalletMoney = async (
  traceId: string,
  userId: string,
  payload: TAddWalletMoneyPayload
) => {
  assertPaymobConfig(traceId);

  const user = await User.findById(userId).select('name email phone address');
  if (!user) {
    throw new ApiError(HttpStatusCode.NotFound, 'User not found', traceId);
  }

  const topUp = await TopUp.create({
    user: userId,
    amount: payload.amount,
    paymentMethod: payload.paymentMethod,
    savedCard: payload.savedCardId ?? null,
    saveCardRequested: payload.saveCard ?? false,
  });

  const amountCents = toPaymobCents(payload.amount);
  const authToken = await getPaymobAuthToken();
  const paymobOrder = await createPaymobOrder(
    authToken,
    buildTopUpMerchantOrderId(topUp._id.toString()),
    amountCents
  );
  const billingData = buildPaymobBillingData({
    name: user.name,
    email: user.email,
    phoneNumber: user.phone,
    address: user.address,
    country: 'Egypt',
  });

  topUp.paymentIntentId = String(paymobOrder.id);
  await topUp.save();

  if (payload.savedCardId) {
    const savedCard = await SavedCardService.getUsableCardById(
      traceId,
      userId,
      payload.savedCardId
    );
    const cardToken = decryptCardToken(savedCard.paymobCardToken, traceId);
    const paymentKey = await createPaymobPaymentKey(
      authToken,
      amountCents,
      paymobOrder.id,
      billingData,
      { cardToken }
    );
    const charge = await payWithPaymobCardToken(paymentKey, cardToken);

    return {
      topUp,
      paymentUrl: resolvePaymobRedirectUrl(charge),
      returnUrl: buildPaymobReturnUrl(),
      paymentIntentId: topUp.paymentIntentId,
      charge,
    };
  }

  const paymentKey = await createPaymobPaymentKey(
    authToken,
    amountCents,
    paymobOrder.id,
    billingData,
    { tokenization: payload.saveCard ?? false }
  );

  return {
    topUp,
    paymentUrl: buildPaymobIframeUrl(paymentKey),
    returnUrl: buildPaymobReturnUrl(),
    paymentIntentId: topUp.paymentIntentId,
  };
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

  return {
    handled: true,
    topUpId: topUp._id,
    status: TOP_UP_STATUS.paid,
    balanceApplied: Boolean(appliedTopUp),
  };
};

/** Returns paginated top-up transactions for user/admin. */
const viewAllTranscrion = async (
  query: Record<string, unknown>,
  requester: TTopUpRequester
) => {
  const filter =
    requester.role === USER_ROLE.admin
      ? { isDeleted: false }
      : { user: requester.userId, isDeleted: false };

  const topUpQuery = new QueryBuilder(
    TopUp.find(filter).populate(topUpPopulate).select('-__v').lean(),
    query
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const [data, meta] = await Promise.all([
    topUpQuery.modelQuery,
    topUpQuery.countTotal(),
  ]);

  return { meta, data };
};

/** Returns one top-up transaction after access verification. */
const viewADetailsTransction = async (
  traceId: string,
  topUpId: string,
  requester: TTopUpRequester
) => {
  const topUp = await TopUp.findOne({ _id: topUpId, isDeleted: false })
    .populate(topUpPopulate)
    .select('-__v');
  if (!topUp) {
    throw new ApiError(HttpStatusCode.NotFound, 'Top-up transaction not found', traceId);
  }

  assertTopUpAccess(traceId, topUp, requester);
  return topUp;
};

export const TopUpService = {
  addWalletMoney,
  processTopUpWebhook,
  viewAllTranscrion,
  viewADetailsTransction,
};
