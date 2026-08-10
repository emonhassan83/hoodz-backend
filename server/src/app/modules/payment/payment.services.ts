import { HttpStatusCode } from 'axios';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import { PAYMENT_STATUS } from '@/app/modules/payment/payment.constant';
import {
  assertPaymobConfig,
  getPaymobAuthToken,
  getPaymobTransaction,
  normalizePaymobCallbackPayload,
  resolvePaymentStatusFromPaymob,
  verifyPaymobWebhookHmac,
} from '@/app/modules/payment/payment.helpers';
import { Payment } from '@/app/modules/payment/payment.model';
import {
  TConfirmPaymentPayload,
  TPaymobWebhookPayload,
} from '@/app/modules/payment/payment.types';
import { Orders } from '@/app/modules/orders/orders.model';
import {
  ORDER_STATUS,
  PAYMENT_STATUS as ORDER_PAYMENT_STATUS,
} from '@/app/modules/orders/orders.constant';
import { SavedCardService } from '@/app/modules/savedCard/savedCard.services';
import { TopUpService } from '@/app/modules/topUp/topUp.services';
import { USER_ROLE } from '@/app/modules/user/user.constant';

const paymentPopulate = [
  { path: 'account', select: 'name email phone profileAvatar' },
  { path: 'order', select: 'id totalAmount paymentStatus status billingDetails' },
  { path: 'savedCard', select: 'maskedPan last4 cardBrand cardSubType isDefault' },
];

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

  payment.status = status;
  payment.isPaid = status === PAYMENT_STATUS.paid;
  payment.transactionId = transactionId;
  payment.paymentIntentId = payload.paymentIntentId ?? payment.paymentIntentId;
  await payment.save();

  const orderUpdate =
    status === PAYMENT_STATUS.paid
      ? {
          paymentStatus: ORDER_PAYMENT_STATUS.paid,
          status: ORDER_STATUS.confirmed,
          transactionId,
        }
      : {
          paymentStatus: ORDER_PAYMENT_STATUS.failed,
          transactionId,
        };

  await Orders.findByIdAndUpdate(payment.order, {
    ...orderUpdate,
  });

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

  const payment = await Payment.findOne({
    ...(paymentIntentId ? { paymentIntentId } : {}),
    isDeleted: false,
  });

  if (!payment) {
    throw new ApiError(HttpStatusCode.NotFound, 'Payment not found', traceId);
  }

  const status = resolvePaymentStatusFromPaymob(transaction);
  payment.status = status;
  payment.isPaid = status === PAYMENT_STATUS.paid;
  payment.transactionId = transactionId ?? payment.transactionId;
  await payment.save();

  if (status === PAYMENT_STATUS.paid && payment.saveCardRequested) {
    try {
      await SavedCardService.saveCardFromPaymobTransaction(
        traceId,
        payment.account.toString(),
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
          status: ORDER_STATUS.confirmed,
          transactionId: payment.transactionId,
        }
      : {
          paymentStatus: ORDER_PAYMENT_STATUS.failed,
          transactionId: payment.transactionId,
        };

  await Orders.findByIdAndUpdate(payment.order, orderUpdate);

  return { received: true, paymentId: payment._id, status };
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
  confirmPayment,
  confirmPaymentByWebhook,
  getAllPayments,
};

