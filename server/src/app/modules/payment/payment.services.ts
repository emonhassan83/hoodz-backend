import { HttpStatusCode } from 'axios';
import mongoose from 'mongoose';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import {
  PAYMENT_STATUS as ORDER_PAYMENT_STATUS,
} from '@/app/modules/orders/orders.constant';
import { CoinService } from '@/app/modules/coin/coin.services';
import { Orders } from '@/app/modules/orders/orders.model';
import { PAYMENT_METHOD, PAYMENT_STATUS } from '@/app/modules/payment/payment.constant';
import {
  assertPaymobConfig,
  buildPaymobBillingData,
  buildPaymobIframeUrl,
  buildPaymobReturnUrl,
  createPaymobOrder,
  createPaymobPaymentKey,
  getPaymobAuthToken,
  getPaymobTransaction,
  normalizePaymobCallbackPayload,
  payWithPaymobCardToken,
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
import {
  decryptCardToken,
  resolvePaymobRedirectUrl,
} from '@/app/modules/savedCard/savedCard.helpers';
import { SavedCardService } from '@/app/modules/savedCard/savedCard.services';
import { TopUpService } from '@/app/modules/topUp/topUp.services';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import { User } from '@/app/modules/user/user.model';
import {
  WALLET_TRANSACTION_DIRECTION,
  WALLET_TRANSACTION_REFERENCE_TYPE,
  WALLET_TRANSACTION_TYPE,
} from '@/app/modules/walletTransaction/walletTransaction.constant';
import { WalletTransactionService } from '@/app/modules/walletTransaction/walletTransaction.services';

const paymentPopulate = [
  { path: 'account', select: 'name email phone profileAvatar' },
  {
    path: 'order',
    select:
      'id amount coinDiscount deliveryCharge totalAmount paymentStatus status billingDetails',
  },
  { path: 'savedCard', select: 'maskedPan last4 cardBrand cardSubType isDefault' },
];

/** Loads unpaid orders owned by the requester for payment initiation. */
const getPayableOrdersOrThrow = async (
  traceId: string,
  userId: string,
  orderIds: string[]
) => {
  const uniqueOrderIds = [...new Set(orderIds)];
  const orders = await Orders.find({
    _id: { $in: uniqueOrderIds },
    user: userId,
    isDeleted: false,
  }).lean();

  if (orders.length !== uniqueOrderIds.length) {
    throw new ApiError(
      HttpStatusCode.NotFound,
      'One or more orders were not found',
      traceId
    );
  }

  const paidOrder = orders.find(
    (order) => order.paymentStatus === ORDER_PAYMENT_STATUS.paid
  );
  if (paidOrder) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      `Order ${paidOrder.id} is already paid`,
      traceId
    );
  }

  const sortedOrders = uniqueOrderIds.map(
    (orderId) => orders.find((order) => order._id.toString() === orderId)!
  );
  const amount = Number(
    sortedOrders.reduce((total, order) => total + order.totalAmount, 0).toFixed(2)
  );
  if (amount <= 0) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Payment amount must be greater than 0',
      traceId
    );
  }

  return { orders: sortedOrders, amount };
};

/** Creates one payment row for each vendor-split order. */
const createPaymentRows = async (
  userId: string,
  orders: Awaited<ReturnType<typeof getPayableOrdersOrThrow>>['orders'],
  payload: TInitiatePaymentPayload,
  session?: mongoose.ClientSession
) =>
  Payment.create(
    orders.map((order) => ({
      account: userId,
      order: order._id,
      subtotalAmount: order.amount,
      coinDiscount: order.coinDiscount ?? 0,
      deliveryCharge: order.deliveryCharge ?? 0,
      amount: order.totalAmount,
      paymentMethod: payload.paymentMethod,
      savedCard: payload.savedCardId ?? null,
      saveCardRequested: payload.saveCard ?? false,
      status:
        payload.paymentMethod === PAYMENT_METHOD.wallet
          ? PAYMENT_STATUS.paid
          : PAYMENT_STATUS.pending,
      isPaid: payload.paymentMethod === PAYMENT_METHOD.wallet,
    })),
    session ? { session } : undefined
  );

/** Returns populated payment rows for API responses. */
const getPopulatedPayments = async (paymentIds: mongoose.Types.ObjectId[]) =>
  Payment.find({ _id: { $in: paymentIds } })
    .populate(paymentPopulate)
    .select('-__v')
    .lean();

/** Starts Paymob card payment with manual card entry or saved card token. */
const initiateCardPayment = async (
  traceId: string,
  userId: string,
  payload: TInitiatePaymentPayload,
  orders: Awaited<ReturnType<typeof getPayableOrdersOrThrow>>['orders'],
  amount: number
) => {
  assertPaymobConfig(traceId);

  const user = await User.findById(userId).select('name email phone address');
  if (!user) {
    throw new ApiError(HttpStatusCode.NotFound, 'User not found', traceId);
  }

  const payments = await createPaymentRows(userId, orders, payload);
  const paymentIds = payments.map((payment) => payment._id);
  const amountCents = toPaymobCents(amount);
  const authToken = await getPaymobAuthToken();
  const paymobOrder = await createPaymobOrder(
    authToken,
    `PAY-${paymentIds[0].toString()}-${Date.now()}`,
    amountCents
  );
  const billingData = buildPaymobBillingData(
    orders[0].billingDetails ?? {
      name: user.name,
      email: user.email,
      phoneNumber: user.phone,
      address: user.address,
      country: 'Egypt',
    }
  );

  await Payment.updateMany(
    { _id: { $in: paymentIds } },
    { paymentIntentId: String(paymobOrder.id) }
  );

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
      paymentMethod: PAYMENT_METHOD.card,
      paymentIntentId: String(paymobOrder.id),
      paymentUrl: resolvePaymobRedirectUrl(charge),
      returnUrl: buildPaymobReturnUrl(),
      payments: await getPopulatedPayments(paymentIds),
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
    paymentMethod: PAYMENT_METHOD.card,
    paymentIntentId: String(paymobOrder.id),
    paymentUrl: buildPaymobIframeUrl(paymentKey),
    returnUrl: buildPaymobReturnUrl(),
    payments: await getPopulatedPayments(paymentIds),
  };
};

/** Pays orders immediately from the user's virtual wallet balance. */
const initiateWalletPayment = async (
  traceId: string,
  userId: string,
  payload: TInitiatePaymentPayload,
  orders: Awaited<ReturnType<typeof getPayableOrdersOrThrow>>['orders'],
  amount: number
) => {
  const session = await mongoose.startSession();
  const paymentIntentId = `WALLET-${Date.now()}`;
  let paymentIds: mongoose.Types.ObjectId[] = [];

  try {
    session.startTransaction();
    const debitedUser = await User.findOneAndUpdate(
      { _id: userId, walletBalance: { $gte: amount } },
      { $inc: { walletBalance: -amount, balance: -amount } },
      { session, new: true }
    );
    if (!debitedUser) {
      throw new ApiError(
        HttpStatusCode.BadRequest,
        'Insufficient wallet balance',
        traceId
      );
    }

    const payments = await createPaymentRows(userId, orders, payload, session);
    paymentIds = payments.map((payment) => payment._id);
    await Payment.updateMany(
      { _id: { $in: paymentIds } },
      {
        status: PAYMENT_STATUS.paid,
        isPaid: true,
        paymentIntentId,
        transactionId: paymentIntentId,
      },
      { session }
    );
    await Orders.updateMany(
      { _id: { $in: orders.map((order) => order._id) } },
      {
        paymentStatus: ORDER_PAYMENT_STATUS.paid,
        transactionId: paymentIntentId,
      },
      { session }
    );

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }

  await CoinService.processPaidOrderRewards(orders.map((order) => order._id));
  await Promise.all(
    orders.map((order) =>
      WalletTransactionService.createWalletTransaction({
        user: userId,
        type: WALLET_TRANSACTION_TYPE.purchase,
        amount: order.totalAmount,
        direction: WALLET_TRANSACTION_DIRECTION.debit,
        referenceType: WALLET_TRANSACTION_REFERENCE_TYPE.Order,
        reference: order._id.toString(),
        paymobTransactionId: paymentIntentId,
        note: 'Order paid using wallet balance',
      })
    )
  );

  return {
    paymentMethod: PAYMENT_METHOD.wallet,
    paymentIntentId,
    payments: await getPopulatedPayments(paymentIds),
  };
};

/** Creates COD payment records and confirms orders without marking them paid. */
const initiateCodPayment = async (
  userId: string,
  payload: TInitiatePaymentPayload,
  orders: Awaited<ReturnType<typeof getPayableOrdersOrThrow>>['orders']
) => {
  const paymentIntentId = `COD-${Date.now()}`;
  const payments = await createPaymentRows(userId, orders, payload);
  const paymentIds = payments.map((payment) => payment._id);

  await Promise.all([
    Payment.updateMany(
      { _id: { $in: paymentIds } },
      { paymentIntentId, status: PAYMENT_STATUS.pending, isPaid: false }
    ),
    Orders.updateMany(
      { _id: { $in: orders.map((order) => order._id) } },
      {
        paymentStatus: ORDER_PAYMENT_STATUS.unpaid,
        transactionId: paymentIntentId,
      }
    ),
  ]);

  return {
    paymentMethod: PAYMENT_METHOD.cod,
    paymentIntentId,
    payments: await getPopulatedPayments(paymentIds),
  };
};

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

  return initiateCodPayment(userId, payload, orders);
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
          transactionId,
        }
      : {
          paymentStatus: ORDER_PAYMENT_STATUS.failed,
          transactionId,
        };

  await Orders.findByIdAndUpdate(payment.order, {
    ...orderUpdate,
  });

  if (status === PAYMENT_STATUS.paid) {
    await CoinService.processPaidOrderRewards([payment.order]);
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

  if (status === PAYMENT_STATUS.paid) {
    await CoinService.processPaidOrderRewards(
      payments.map((payment) => payment.order)
    );
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
