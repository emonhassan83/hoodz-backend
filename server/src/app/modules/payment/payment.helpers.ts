import crypto from 'node:crypto';

import axios, { HttpStatusCode } from 'axios';
import mongoose from 'mongoose';

import { env } from '@/app/configs/env.configs';
import ApiError from '@/app/errors/ApiError';
import { CoinService } from '@/app/modules/coin/coin.services';
import {
  PAYMENT_STATUS as ORDER_PAYMENT_STATUS,
} from '@/app/modules/orders/orders.constant';
import {
  applyOrderInventoryOrThrow,
  notifyOrdersPaid,
} from '@/app/modules/orders/orders.helpers';
import { Orders } from '@/app/modules/orders/orders.model';
import { PAYMENT_METHOD, PAYMENT_STATUS } from '@/app/modules/payment/payment.constant';
import { Payment } from '@/app/modules/payment/payment.model';
import { TInitiatePaymentPayload } from '@/app/modules/payment/payment.types';
import {
  decryptCardToken,
  resolvePaymobRedirectUrl,
} from '@/app/modules/savedCard/savedCard.helpers';
import { SavedCardService } from '@/app/modules/savedCard/savedCard.services';
import { User } from '@/app/modules/user/user.model';
import {
  WALLET_TRANSACTION_DIRECTION,
  WALLET_TRANSACTION_REFERENCE_TYPE,
  WALLET_TRANSACTION_TYPE,
} from '@/app/modules/walletTransaction/walletTransaction.constant';
import { WalletTransactionService } from '@/app/modules/walletTransaction/walletTransaction.services';

type TPaymobBillingData = {
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  apartment: string;
  floor: string;
  street: string;
  building: string;
  city: string;
  country: string;
};

const getPaymobBaseUrl = () =>
  env.PAYMOB_BASE_URL || 'https://accept.paymob.com/api';

export const buildPaymobReturnUrl = () =>
  `${env.SERVER_URL.replace(/\/$/, '')}/payments/paymob/return`;

export const assertPaymobConfig = (traceId: string) => {
  if (!env.PAYMOB_API_KEY || !env.PAYMOB_INTEGRATION_ID || !env.PAYMOB_IFRAME_ID) {
    throw new ApiError(
      HttpStatusCode.InternalServerError,
      'Paymob configuration is missing',
      traceId
    );
  }
};

export const toPaymobCents = (amount: number) => Math.round(amount * 100);

export const splitCustomerName = (name?: string | null) => {
  const parts = (name || 'Hoodz Customer').trim().split(/\s+/);
  return {
    firstName: parts[0] || 'Hoodz',
    lastName: parts.slice(1).join(' ') || 'Customer',
  };
};

export const buildPaymobBillingData = (billing: any): TPaymobBillingData => {
  const { firstName, lastName } = splitCustomerName(billing?.name);
  return {
    first_name: firstName,
    last_name: lastName,
    email: billing?.email || 'customer@hoodz.local',
    phone_number: billing?.phoneNumber || 'NA',
    apartment: String(billing?.apartment ?? 'NA'),
    floor: String(billing?.floorNo ?? 'NA'),
    street: billing?.address || 'NA',
    building: String(billing?.buildingNo ?? 'NA'),
    city: billing?.city || 'NA',
    country: billing?.country || 'Egypt',
  };
};

export const getPaymobAuthToken = async () => {
  const response = await axios.post(`${getPaymobBaseUrl()}/auth/tokens`, {
    api_key: env.PAYMOB_API_KEY,
  });
  return response.data.token as string;
};

export const createPaymobOrder = async (
  authToken: string,
  merchantOrderId: string,
  amountCents: number
) => {
  const response = await axios.post(`${getPaymobBaseUrl()}/ecommerce/orders`, {
    auth_token: authToken,
    delivery_needed: false,
    amount_cents: amountCents,
    currency: env.PAYMOB_CURRENCY || 'EGP',
    merchant_order_id: merchantOrderId,
    items: [],
  });

  return response.data;
};

export const createPaymobPaymentKey = async (
  authToken: string,
  amountCents: number,
  paymobOrderId: number,
  billingData: TPaymobBillingData,
  options: { tokenization?: boolean; cardToken?: string } = {}
) => {
  const response = await axios.post(`${getPaymobBaseUrl()}/acceptance/payment_keys`, {
    auth_token: authToken,
    amount_cents: amountCents,
    expiration: 3600,
    order_id: paymobOrderId,
    billing_data: billingData,
    currency: env.PAYMOB_CURRENCY || 'EGP',
    integration_id: Number(env.PAYMOB_INTEGRATION_ID),
    ...(options.tokenization ? { tokenization: true } : {}),
    ...(options.cardToken ? { token: options.cardToken } : {}),
  });

  return response.data.token as string;
};

export const buildPaymobIframeUrl = (paymentToken: string) =>
  `https://accept.paymob.com/api/acceptance/iframes/${env.PAYMOB_IFRAME_ID}?payment_token=${paymentToken}`;

export const buildPaymobReturnHtml = (query: Record<string, any>) => {
  const success = query.success === 'true' || query.success === true;
  const errorOccured =
    query.error_occured === 'true' || query.error_occured === true;
  const pending = query.pending === 'true' || query.pending === true;
  const failed = !success && (errorOccured || !pending);
  const errorMessage = String(query['data.message'] ?? query.message ?? '')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const statusText = success
    ? 'Payment received'
    : failed
      ? 'Payment failed'
      : 'Payment processing';
  const title = success
    ? 'Payment Successful'
    : failed
      ? 'Payment Failed'
      : 'Payment Status';
  const message = success
    ? 'Your payment was successful. You can now return to the app.'
    : failed
      ? errorMessage ||
        'Your card payment was declined. Please try another card or payment method.'
      : 'Your payment response was received. Final confirmation may take a moment.';
  const badgeColor = success ? '#16a34a' : failed ? '#dc2626' : '#f97316';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { margin: 0; font-family: Arial, sans-serif; background: #f7f7f8; color: #1f2937; }
      .wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
      .box { max-width: 460px; width: 100%; background: #fff; border-radius: 12px; padding: 28px; box-shadow: 0 12px 30px rgba(0,0,0,.08); text-align: center; }
      .badge { display: inline-block; padding: 8px 14px; border-radius: 999px; color: #fff; background: ${badgeColor}; font-size: 13px; font-weight: 700; }
      h1 { margin: 18px 0 10px; font-size: 24px; }
      p { margin: 0; color: #6b7280; line-height: 1.5; }
      .hint { margin-top: 18px; font-size: 13px; color: #9ca3af; }
    </style>
  </head>
  <body>
    <main class="wrap">
      <section class="box">
        <span class="badge">${statusText}</span>
        <h1>${title}</h1>
        <p>${message}</p>
        <div class="hint">Hoodz Backend payment callback page</div>
      </section>
    </main>
  </body>
</html>`;
};

export const getPaymobTransaction = async (
  authToken: string,
  transactionId: string
) => {
  const response = await axios.get(
    `${getPaymobBaseUrl()}/acceptance/transactions/${transactionId}`,
    { params: { token: authToken } }
  );
  return response.data;
};

export const payWithPaymobCardToken = async (
  paymentToken: string,
  cardToken: string
) => {
  const response = await axios.post(
    `${getPaymobBaseUrl()}/acceptance/payments/pay`,
    {
      payment_token: paymentToken,
      source: {
        identifier: cardToken,
        subtype: 'TOKEN',
      },
    }
  );

  return response.data;
};

export const refundPaymobTransaction = async (
  authToken: string,
  transactionId: string,
  amountCents: number
) => {
  const response = await axios.post(
    `${getPaymobBaseUrl()}/acceptance/void_refund/refund`,
    {
      auth_token: authToken,
      transaction_id: transactionId,
      amount_cents: amountCents,
    }
  );

  return response.data;
};

export const resolvePaymentStatusFromPaymob = (transaction: any) => {
  if (transaction?.success === true && transaction?.is_voided !== true && transaction?.is_refunded !== true) {
    return PAYMENT_STATUS.paid;
  }
  return PAYMENT_STATUS.failed;
};

const PAYMOB_HMAC_KEYS = [
  'amount_cents',
  'created_at',
  'currency',
  'error_occured',
  'has_parent_transaction',
  'id',
  'integration_id',
  'is_3d_secure',
  'is_auth',
  'is_capture',
  'is_refunded',
  'is_standalone_payment',
  'is_voided',
  'order.id',
  'owner',
  'pending',
  'source_data.pan',
  'source_data.sub_type',
  'source_data.type',
  'success',
];

const getNestedValue = (payload: Record<string, any>, path: string) =>
  path.split('.').reduce((value, key) => value?.[key], payload);

export const normalizePaymobCallbackPayload = (payload: Record<string, any>) => {
  const normalized = { ...payload };

  Object.entries(payload).forEach(([key, value]) => {
    if (!key.includes('.')) return;

    const parts = key.split('.');
    let cursor = normalized as Record<string, any>;
    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        cursor[part] = value;
        return;
      }

      cursor[part] = cursor[part] ?? {};
      cursor = cursor[part];
    });
  });

  return normalized;
};

export const verifyPaymobWebhookHmac = (
  payload: Record<string, any>,
  hmac?: string
) => {
  if (!env.PAYMOB_HMAC_SECRET) return true;
  if (!hmac) return false;

  const raw = PAYMOB_HMAC_KEYS.map((key) => {
    const value =
      key === 'order.id'
        ? getNestedValue(payload, key) ?? payload.order
        : getNestedValue(payload, key);
    if (value === undefined || value === null) return '';
    return String(value);
  }).join('');

  const digest = crypto
    .createHmac('sha512', env.PAYMOB_HMAC_SECRET)
    .update(raw)
    .digest('hex');

  return digest === hmac;
};

export const paymentPopulate = [
  { path: 'account', select: 'name email phone profileAvatar' },
  {
    path: 'order',
    select:
      'id amount coinDiscount deliveryCharge totalAmount paymentStatus status billingDetails',
  },
  { path: 'savedCard', select: 'maskedPan last4 cardBrand cardSubType isDefault' },
];

/** Formats one payment row for user transaction list responses. */
export const formatPaymentTransaction = (payment: Record<string, any>) => {
  const order =
    payment.order && typeof payment.order === 'object' && payment.order._id
      ? {
          _id: payment.order._id,
          id: payment.order.id ?? null,
        }
      : payment.order
        ? { _id: payment.order, id: null }
        : null;

  return {
    _id: payment._id,
    order,
    transactionId: payment.transactionId ?? null,
    paymentIntentId: payment.paymentIntentId ?? null,
    subtotalAmount: payment.subtotalAmount,
    coinDiscount: payment.coinDiscount ?? 0,
    deliveryCharge: payment.deliveryCharge ?? 0,
    amount: payment.amount,
    status: payment.status,
    paymentMethod: payment.paymentMethod,
    isPaid: Boolean(payment.isPaid),
    id: payment.id,
    createdAt: payment.createdAt,
  };
};

export const getPayableOrdersOrThrow = async (
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

export const createPaymentRows = async (
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

export const getPopulatedPayments = async (paymentIds: mongoose.Types.ObjectId[]) =>
  Payment.find({ _id: { $in: paymentIds } })
    .populate(paymentPopulate)
    .select('-__v')
    .lean();

export const initiateCardPayment = async (
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

export const initiateWalletPayment = async (
  traceId: string,
  userId: string,
  payload: TInitiatePaymentPayload,
  orders: Awaited<ReturnType<typeof getPayableOrdersOrThrow>>['orders'],
  amount: number
) => {
  const session = await mongoose.startSession();
  const paymentIntentId = `WALLET-${Date.now()}`;
  let paymentIds: mongoose.Types.ObjectId[] = [];
  const orderIds = orders.map((order) => order._id);

  try {
    session.startTransaction();

    const debitedUser = await User.findOneAndUpdate(
      { _id: userId, walletBalance: { $gte: amount } },
      { $inc: { walletBalance: -amount } },
      { session, new: true }
    );
    if (!debitedUser) {
      throw new ApiError(
        HttpStatusCode.BadRequest,
        'Insufficient wallet balance',
        traceId
      );
    }

    const payments = await Payment.create(
      orders.map((order) => ({
        account: userId,
        order: order._id,
        subtotalAmount: order.amount,
        coinDiscount: order.coinDiscount ?? 0,
        deliveryCharge: order.deliveryCharge ?? 0,
        amount: order.totalAmount,
        paymentMethod: PAYMENT_METHOD.wallet,
        savedCard: null,
        saveCardRequested: false,
        status: PAYMENT_STATUS.paid,
        isPaid: true,
        paymentIntentId,
        transactionId: paymentIntentId,
      })),
      { session }
    );
    paymentIds = payments.map((payment) => payment._id);

    const orderUpdateResult = await Orders.updateMany(
      { _id: { $in: orderIds } },
      {
        paymentStatus: ORDER_PAYMENT_STATUS.paid,
        transactionId: paymentIntentId,
      },
      { session }
    );
    if (!orderUpdateResult.matchedCount) {
      throw new ApiError(
        HttpStatusCode.BadRequest,
        'Failed to mark orders as paid',
        traceId
      );
    }

    await applyOrderInventoryOrThrow(traceId, orderIds, session);
    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }

  await CoinService.processPaidOrderRewards(orderIds);
  await notifyOrdersPaid(orderIds);
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

export const initiateCodPayment = async (
  traceId: string,
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
  await applyOrderInventoryOrThrow(
    traceId,
    orders.map((order) => order._id)
  );

  return {
    paymentMethod: PAYMENT_METHOD.cod,
    paymentIntentId,
    payments: await getPopulatedPayments(paymentIds),
  };
};

