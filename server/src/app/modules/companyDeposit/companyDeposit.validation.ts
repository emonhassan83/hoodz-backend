import { z } from 'zod';

import { COMPANY_DEPOSIT_STATUS } from '@/app/modules/companyDeposit/companyDeposit.constant';

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
        COMPANY_DEPOSIT_STATUS.verified,
        COMPANY_DEPOSIT_STATUS.rejected,
      ]),
      reason: z.string().trim().optional(),
    })
    .superRefine((data, ctx) => {
      if (data.status === COMPANY_DEPOSIT_STATUS.rejected && !data.reason) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['reason'],
          message: 'Reason is required when rejecting deposit',
        });
      }
    }),
});

export const CompanyDepositValidation = {
  depositIdParamValidationSchema,
  verifyDepositValidationSchema,
};

