import { HttpStatusCode } from 'axios';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import { PAYMENT_METHOD, PAYMENT_STATUS } from '@/app/modules/payment/payment.constant';
import {
  assertPaymobConfig,
  buildPaymobBillingData,
  buildPaymobIframeUrl,
  createPaymobOrder,
  createPaymobPaymentKey,
  getPaymobAuthToken,
  getPaymobTransaction,
  resolvePaymentStatusFromPaymob,
  toPaymobCents,
  verifyPaymobWebhookHmac,
} from '@/app/modules/payment/payment.helpers';
import { Payment } from '@/app/modules/payment/payment.model';
import {
  TConfirmPaymentPayload,
  TInitiatePaymentPayload,
  TPaymobWebhookPayload,
} from '@/app/modules/payment/payment.types';
import { Orders } from '@/app/modules/orders/orders.model';
import {
  ORDER_STATUS,
  PAYMENT_STATUS as ORDER_PAYMENT_STATUS,
} from '@/app/modules/orders/orders.constant';
import { USER_ROLE } from '@/app/modules/user/user.constant';

const paymentPopulate = [
  { path: 'account', select: 'name email phone profileAvatar' },
  { path: 'order', select: 'id totalAmount paymentStatus status billingDetails' },
];

const getOrderForPayment = async (
  traceId: string,
  orderId: string,
  userId: string
) => {
  const order = await Orders.findOne({
    _id: orderId,
    user: userId,
    isDeleted: false,
  });

  if (!order) {
    throw new ApiError(HttpStatusCode.NotFound, 'Order not found', traceId);
  }

  if (order.paymentStatus === ORDER_PAYMENT_STATUS.paid) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Order already paid', traceId);
  }

  return order;
};

const initiatePayment = async (
  traceId: string,
  userId: string,
  payload: TInitiatePaymentPayload
) => {
  const order = await getOrderForPayment(traceId, payload.orderId, userId);

  if (payload.paymentMethod === PAYMENT_METHOD.cod) {
    const payment = await Payment.findOneAndUpdate(
      { account: userId, order: order._id, paymentMethod: PAYMENT_METHOD.cod },
      {
        account: userId,
        order: order._id,
        amount: order.totalAmount,
        paymentMethod: PAYMENT_METHOD.cod,
        status: PAYMENT_STATUS.pending,
        isPaid: false,
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    ).select('-__v');

    return { payment, paymentUrl: null };
  }

  if (payload.paymentMethod !== PAYMENT_METHOD.card) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Only card and cod payments are supported right now',
      traceId
    );
  }

  assertPaymobConfig(traceId);
  const amountCents = toPaymobCents(order.totalAmount);
  const payment = await Payment.findOneAndUpdate(
    { account: userId, order: order._id, paymentMethod: PAYMENT_METHOD.card },
    {
      account: userId,
      order: order._id,
      amount: order.totalAmount,
      paymentMethod: PAYMENT_METHOD.card,
      status: PAYMENT_STATUS.pending,
      isPaid: false,
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  const authToken = await getPaymobAuthToken();
  const paymobOrder = await createPaymobOrder(
    authToken,
    `${payment._id.toString()}-${Date.now()}`,
    amountCents
  );
  const paymentKey = await createPaymobPaymentKey(
    authToken,
    amountCents,
    paymobOrder.id,
    buildPaymobBillingData(order.billingDetails)
  );

  payment.paymentIntentId = String(paymobOrder.id);
  await payment.save();

  return {
    payment,
    paymentUrl: buildPaymobIframeUrl(paymentKey),
    paymentIntentId: payment.paymentIntentId,
  };
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
  if (!verifyPaymobWebhookHmac(payload.obj ?? payload, hmac)) {
    throw new ApiError(HttpStatusCode.Forbidden, 'Invalid Paymob webhook signature', traceId);
  }

  const transaction = payload.obj ?? payload;
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
  initiatePayment,
  confirmPayment,
  confirmPaymentByWebhook,
  getAllPayments,
};

