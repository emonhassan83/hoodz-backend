import axios, { HttpStatusCode } from 'axios';
import mongoose from 'mongoose';

import { env } from '@/app/configs/env.configs';
import ApiError from '@/app/errors/ApiError';
import {
  PAYMENT_STATUS as ORDER_PAYMENT_STATUS,
} from '@/app/modules/orders/orders.constant';
import { applyOrderInventoryOrThrow } from '@/app/modules/orders/orders.helpers';
import { Orders } from '@/app/modules/orders/orders.model';
import { PAYMENT_METHOD, PAYMENT_STATUS } from '@/app/modules/payment/payment.constant';
import { Payment } from '@/app/modules/payment/payment.model';
import { TInitiatePaymentPayload } from '@/app/modules/payment/payment.types';

/*
 * NOTE (cash-only cleanup): order payments are COD-only — PaymentService
 * rejects every non-COD initiation and the online webhook/return routes are
 * not mounted. The gateway helpers below are NOT used by the payment module
 * itself anymore; they remain because the wallet top-up module
 * (topUp.services) and the saved-card module (savedCard.services) still
 * import them for their own card flows. Remove them together with those
 * modules if online payments are retired completely.
 */

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

export const resolvePaymentStatusFromPaymob = (transaction: any) => {
  if (transaction?.success === true && transaction?.is_voided !== true && transaction?.is_refunded !== true) {
    return PAYMENT_STATUS.paid;
  }
  return PAYMENT_STATUS.failed;
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
