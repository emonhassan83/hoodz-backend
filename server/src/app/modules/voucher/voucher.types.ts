import {
  VOUCHER_DISCOUNT_TYPE,
  VOUCHER_STATUS,
  VOUCHER_TYPE,
} from '@/app/modules/voucher/voucher.constant';

export type TVoucherType =
  (typeof VOUCHER_TYPE)[keyof typeof VOUCHER_TYPE];

export type TVoucherDiscountType =
  (typeof VOUCHER_DISCOUNT_TYPE)[keyof typeof VOUCHER_DISCOUNT_TYPE];

export type TVoucherStatus =
  (typeof VOUCHER_STATUS)[keyof typeof VOUCHER_STATUS];

export type TVoucherGiftDetails = {
  name?: string;
  bannerImage?: string[];
  description?: string;
};

export type TVoucherPayload = {
  code: string;
  title: string;
  description?: string;
  voucherType: TVoucherType;
  shop?: string | null;
  user?: string | null;
  discountType: TVoucherDiscountType;
  discountValue: number;
  maxDiscountAmount?: number;
  giftDetails?: TVoucherGiftDetails;
  minSpend?: number;
  expiryDate: string | Date;
  status?: TVoucherStatus;
};

export type TUpdateVoucherPayload = Partial<TVoucherPayload>;

export type TUpdateVoucherStatusPayload = {
  status: TVoucherStatus;
};

export type TVoucherRequester = {
  userId: string;
  role: string;
};
