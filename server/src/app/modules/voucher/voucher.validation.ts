import { z } from 'zod';

import {
  VOUCHER_DISCOUNT_TYPE,
  VOUCHER_STATUS,
  VOUCHER_TYPE,
} from '@/app/modules/voucher/voucher.constant';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const giftDetailsSchema = z.object({
  name: z.string().trim().min(1).optional(),
  bannerImage: z.array(z.string().trim().min(1)).optional(),
  description: z.string().trim().optional(),
});

const voucherBodySchema = z
  .object({
    code: z.string().trim().min(2),
    title: z.string().trim().min(1),
    description: z.string().trim().optional(),
    voucherType: z.enum(Object.values(VOUCHER_TYPE) as [string, ...string[]]),
    shop: objectIdSchema.nullable().optional(),
    user: objectIdSchema.nullable().optional(),
    discountType: z.enum(
      Object.values(VOUCHER_DISCOUNT_TYPE) as [string, ...string[]]
    ),
    discountValue: z.number().min(0),
    maxDiscountAmount: z.number().min(0).optional(),
    giftDetails: giftDetailsSchema.optional(),
    minSpend: z.number().min(0).optional(),
    expiryDate: z.string().datetime().or(z.string().min(1)),
    status: z.enum(Object.values(VOUCHER_STATUS) as [string, ...string[]]).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.voucherType === VOUCHER_TYPE.shopwise && !data.shop) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['shop'],
        message: 'Shop is required for shopwise voucher',
      });
    }

    if (data.voucherType === VOUCHER_TYPE.compension && !data.user) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['user'],
        message: 'User is required for compension voucher',
      });
    }

    if (
      data.discountType === VOUCHER_DISCOUNT_TYPE.gift &&
      (!data.giftDetails?.name || !data.giftDetails?.bannerImage?.length)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['giftDetails'],
        message: 'Gift name and banner image are required',
      });
    }
  });

const addVoucherValidationSchema = z.object({
  body: voucherBodySchema,
});

const updateVoucherValidationSchema = z.object({
  params: z.object({
    voucherId: objectIdSchema,
  }),
  body: voucherBodySchema.partial(),
});

const updateVoucherStatusValidationSchema = z.object({
  params: z.object({
    voucherId: objectIdSchema,
  }),
  body: z.object({
    status: z.enum(Object.values(VOUCHER_STATUS) as [string, ...string[]]),
  }),
});

const voucherIdParamValidationSchema = z.object({
  params: z.object({
    voucherId: objectIdSchema,
  }),
});

const vendorIdParamValidationSchema = z.object({
  params: z.object({
    vendorId: objectIdSchema,
  }),
});

export const VoucherValidation = {
  addVoucherValidationSchema,
  updateVoucherValidationSchema,
  updateVoucherStatusValidationSchema,
  voucherIdParamValidationSchema,
  vendorIdParamValidationSchema,
};
