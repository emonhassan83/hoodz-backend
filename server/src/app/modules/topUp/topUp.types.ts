import {
  TOP_UP_PAYMENT_METHOD,
  TOP_UP_STATUS,
} from '@/app/modules/topUp/topUp.constant';

export type TTopUpStatus =
  (typeof TOP_UP_STATUS)[keyof typeof TOP_UP_STATUS];

export type TTopUpPaymentMethod =
  (typeof TOP_UP_PAYMENT_METHOD)[keyof typeof TOP_UP_PAYMENT_METHOD];

export type TAddWalletMoneyPayload = {
  amount: number;
  paymentMethod: TTopUpPaymentMethod;
  savedCardId?: string;
  saveCard?: boolean;
};

export type TTopUpRequester = {
  userId: string;
  role: string;
};
