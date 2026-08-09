import { z } from 'zod';

import { DEPOSIT_STATUS } from '@/app/modules/deposit/deposit.constant';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const depositIdParamValidationSchema = z.object({
  params: z.object({
    depositId: objectIdSchema,
  }),
});

const verifyDepositValidationSchema = z.object({
  params: z.object({
    depositId: objectIdSchema,
  }),
  body: z
    .object({
      status: z.enum([
        DEPOSIT_STATUS.verified,
        DEPOSIT_STATUS.rejected,
      ]),
      reason: z.string().trim().optional(),
    })
    .superRefine((data, ctx) => {
      if (data.status === DEPOSIT_STATUS.rejected && !data.reason) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['reason'],
          message: 'Reason is required when rejecting deposit',
        });
      }
    }),
});

export const DepositValidation = {
  depositIdParamValidationSchema,
  verifyDepositValidationSchema,
};




