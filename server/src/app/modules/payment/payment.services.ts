import { HttpStatusCode } from 'axios';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import {
  PAYMENT_STATUS as ORDER_PAYMENT_STATUS,
} from '@/app/modules/orders/orders.constant';
import { CoinService } from '@/app/modules/coin/coin.services';
import { notifyOrdersPaid } from '@/app/modules/orders/orders.helpers';
import { Orders } from '@/app/modules/orders/orders.model';
import { PAYMENT_METHOD, PAYMENT_STATUS } from '@/app/modules/payment/payment.constant';
import {
  assertPaymobConfig,
  getPayableOrdersOrThrow,
  getPaymobAuthToken,
  getPaymobTransaction,
  initiateCardPayment,
  initiateCodPayment,
  initiateWalletPayment,
  normalizePaymobCallbackPayload,
  paymentPopulate,
  resolvePaymentStatusFromPaymob,
  verifyPaymobWebhookHmac,
} from '@/app/modules/payment/payment.helpers';
import { Payment } from '@/app/modules/payment/payment.model';
import {
  TConfirmPaymentPayload,
  TInitiatePaymentPayload,
  TPaymobWebhookPayload,
} from '@/app/modules/payment/payment.types';
import { SavedCardService } from '@/app/modules/savedCard/savedCard.services';
import { TopUpService } from '@/app/modules/topUp/topUp.services';
import { USER_ROLE } from '@/app/modules/user/user.constant';

const initiatePayment = async (
  traceId: string,
  userId: string,
  payload: TInitiatePaymentPayload
) => {
  const { orders, amount } = await getPayableOrdersOrThrow(
    traceId,
    userId,
    payload.orderIds
  );

  if (payload.paymentMethod === PAYMENT_METHOD.card) {
    return initiateCardPayment(traceId, userId, payload, orders, amount);
  }

  if (payload.paymentMethod === PAYMENT_METHOD.wallet) {
    return initiateWalletPayment(traceId, userId, payload, orders, amount);
  }

  return initiateCodPayment(traceId, userId, payload, orders);
};

const confirmPayment = async (
  traceId: string,
  userId: string,
  payload: TConfirmPaymentPayload
) => {
  const payment = await Payment.findOne({
    _id: payload.paymentId,
    account: userId,
    isDeleted: false,
  });

  if (!payment) {
    throw new ApiError(HttpStatusCode.NotFound, 'Payment not found', traceId);
  }

  let status = payload.success ? PAYMENT_STATUS.paid : PAYMENT_STATUS.failed;
  let transactionId = payload.transactionId ?? null;

  if (payload.transactionId) {
    assertPaymobConfig(traceId);
    const authToken = await getPaymobAuthToken();
    const transaction = await getPaymobTransaction(authToken, payload.transactionId);
    status = resolvePaymentStatusFromPaymob(transaction);
    transactionId = String(transaction.id ?? payload.transactionId);
  }

  const alreadyPaid = payment.isPaid;

  payment.status = status;
  payment.isPaid = status === PAYMENT_STATUS.paid;
  payment.transactionId = transactionId;
  payment.paymentIntentId = payload.paymentIntentId ?? payment.paymentIntentId;
  await payment.save();

  const orderUpdate =
    status === PAYMENT_STATUS.paid
      ? {
          paymentStatus: ORDER_PAYMENT_STATUS.paid,
          transactionId,
        }
      : {
          paymentStatus: ORDER_PAYMENT_STATUS.failed,
          transactionId,
        };

  await Orders.findByIdAndUpdate(payment.order, {
    ...orderUpdate,
  });

  if (status === PAYMENT_STATUS.paid && !alreadyPaid) {
    await CoinService.processPaidOrderRewards([payment.order]);
    await notifyOrdersPaid([payment.order]);
  }

  return payment.populate(paymentPopulate);
};

const confirmPaymentByWebhook = async (
  traceId: string,
  payload: TPaymobWebhookPayload,
  hmac?: string
) => {
  const normalizedPayload = normalizePaymobCallbackPayload(payload.obj ?? payload);
  if (!verifyPaymobWebhookHmac(normalizedPayload, hmac)) {
    throw new ApiError(HttpStatusCode.Forbidden, 'Invalid Paymob webhook signature', traceId);
  }

  const transaction = normalizedPayload;
  const setupResult = await SavedCardService.processSetupWebhook(
    traceId,
    transaction
  );
  if (setupResult?.handled) {
    return setupResult;
  }

  const topUpResult = await TopUpService.processTopUpWebhook(traceId, transaction);
  if (topUpResult?.handled) {
    return topUpResult;
  }

  const paymentIntentId =
    typeof transaction?.order === 'object' && transaction.order?.id
      ? String(transaction.order.id)
      : transaction?.order
        ? String(transaction.order)
        : undefined;
  const transactionId = transaction?.id ? String(transaction.id) : undefined;

  const payments = await Payment.find({
    ...(paymentIntentId ? { paymentIntentId } : {}),
    isDeleted: false,
  });

  if (!payments.length) {
    throw new ApiError(HttpStatusCode.NotFound, 'Payment not found', traceId);
  }

  const status = resolvePaymentStatusFromPaymob(transaction);
  const unpaidPayments = payments.filter((payment) => !payment.isPaid);
  await Payment.updateMany(
    { _id: { $in: payments.map((payment) => payment._id) } },
    {
      status,
      isPaid: status === PAYMENT_STATUS.paid,
      transactionId,
    }
  );

  const firstPayment = payments[0];
  if (status === PAYMENT_STATUS.paid && firstPayment.saveCardRequested) {
    try {
      await SavedCardService.saveCardFromPaymobTransaction(
        traceId,
        firstPayment.account.toString(),
        transaction
      );
    } catch {
      // Payment confirmation must remain source-of-truth even if tokenization
      // metadata is missing or card saving fails.
    }
  }

  const orderUpdate =
    status === PAYMENT_STATUS.paid
      ? {
          paymentStatus: ORDER_PAYMENT_STATUS.paid,
          transactionId,
        }
      : {
          paymentStatus: ORDER_PAYMENT_STATUS.failed,
          transactionId,
        };

  await Orders.updateMany(
    { _id: { $in: payments.map((payment) => payment.order) } },
    orderUpdate
  );

  if (status === PAYMENT_STATUS.paid && unpaidPayments.length > 0) {
    await CoinService.processPaidOrderRewards(
      unpaidPayments.map((payment) => payment.order)
    );
    await notifyOrdersPaid(unpaidPayments.map((payment) => payment.order));
  }

  return {
    received: true,
    paymentIds: payments.map((payment) => payment._id),
    status,
  };
};

const getAllPayments = async (
  query: Record<string, unknown>,
  requester: { userId: string; role: string }
) => {
  const filter =
    requester.role === USER_ROLE.admin
      ? { isDeleted: false }
      : { account: requester.userId, isDeleted: false };

  const paymentQuery = new QueryBuilder(
    Payment.find(filter).populate(paymentPopulate).select('-__v').lean(),
    query
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const [payments, meta] = await Promise.all([
    paymentQuery.modelQuery,
    paymentQuery.countTotal(),
  ]);

  return { meta, data: payments };
};

export const PaymentService = {
  initiatePayment,
  confirmPayment,
  confirmPaymentByWebhook,
  getAllPayments,
};
