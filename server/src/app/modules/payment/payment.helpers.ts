import axios from 'axios';
import { HttpStatusCode } from 'axios';
import crypto from 'node:crypto';

import { env } from '@/app/configs/env.configs';
import ApiError from '@/app/errors/ApiError';
import { PAYMENT_STATUS } from '@/app/modules/payment/payment.constant';

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
  billingData: TPaymobBillingData
) => {
  const response = await axios.post(`${getPaymobBaseUrl()}/acceptance/payment_keys`, {
    auth_token: authToken,
    amount_cents: amountCents,
    expiration: 3600,
    order_id: paymobOrderId,
    billing_data: billingData,
    currency: env.PAYMOB_CURRENCY || 'EGP',
    integration_id: Number(env.PAYMOB_INTEGRATION_ID),
  });

  return response.data.token as string;
};

export const buildPaymobIframeUrl = (paymentToken: string) =>
  `https://accept.paymob.com/api/acceptance/iframes/${env.PAYMOB_IFRAME_ID}?payment_token=${paymentToken}`;

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

export const verifyPaymobWebhookHmac = (
  payload: Record<string, any>,
  hmac?: string
) => {
  if (!env.PAYMOB_HMAC_SECRET) return true;
  if (!hmac) return false;

  const raw = PAYMOB_HMAC_KEYS.map((key) => {
    const value = getNestedValue(payload, key);
    if (value === undefined || value === null) return '';
    return String(value);
  }).join('');

  const digest = crypto
    .createHmac('sha512', env.PAYMOB_HMAC_SECRET)
    .update(raw)
    .digest('hex');

  return digest === hmac;
};
