import {
  PAYMENT_METHOD,
  PAYMENT_STATUS,
} from '@/app/modules/payment/payment.constant';

export type TPaymentStatus =
  (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

export type TPaymentMethod =
  (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD];

export type TConfirmPaymentPayload = {
  paymentId?: string;
  transactionId?: string;
  paymentIntentId?: string;
  success?: boolean;
};

export type TPaymobWebhookPayload = Record<string, any>;

