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
  nameArabic?: string;
  bannerImage?: string[];
  description?: string;
  descriptionArabic?: string;
};

export type TVoucherPayload = {
  code: string;
  title: string;
  titleArabic?: string | null;
  description?: string;
  descriptionArabic?: string | null;
  voucherType: TVoucherType;
  shop?: string | null;
  user?: string | null;
  discountType: TVoucherDiscountType;
  discountValue: number;
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
