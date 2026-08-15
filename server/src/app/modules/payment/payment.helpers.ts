import crypto from 'node:crypto';

import axios, { HttpStatusCode } from 'axios';

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
  const statusText = success ? 'Payment received' : 'Payment processing';
  const title = success ? 'Payment Successful' : 'Payment Status';
  const message = success
    ? 'Your payment response was received. You can now return to the app.'
    : 'Your payment response was received. Final confirmation may take a moment.';

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
      .badge { display: inline-block; padding: 8px 14px; border-radius: 999px; color: #fff; background: ${success ? '#16a34a' : '#f97316'}; font-size: 13px; font-weight: 700; }
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

