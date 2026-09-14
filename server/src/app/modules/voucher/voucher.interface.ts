import { Model, Types } from 'mongoose';

import {
  TVoucherDiscountType,
  TVoucherGiftDetails,
  TVoucherStatus,
  TVoucherType,
} from '@/app/modules/voucher/voucher.types';

export interface IVoucher {
  _id: Types.ObjectId;
  code: string;
  title: string;
  titleArabic?: string | null;
  description?: string | null;
  descriptionArabic?: string | null;
  voucherType: TVoucherType;
  shop?: Types.ObjectId | null;
  user?: Types.ObjectId | null;
  discountType: TVoucherDiscountType;
  discountValue: number;
  giftDetails?: TVoucherGiftDetails;
  minSpend: number;
  expiryDate: Date;
  status: TVoucherStatus;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type IVoucherModel = Model<IVoucher, Record<string, unknown>>;
