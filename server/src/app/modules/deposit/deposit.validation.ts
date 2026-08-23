import { z } from 'zod';

import { DEPOSIT_STATUS } from '@/app/modules/deposit/deposit.constant';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const submitDepositValidationSchema = z.object({
  body: z.object({
    jobIds: z.array(objectIdSchema).min(1),
    fawryRefNo: z.string().trim().min(1),
    receiptFiles: z.array(z.string().trim().min(1)).min(1),
    note: z.string().trim().optional(),
  }),
});

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
        DEPOSIT_STATUS.completed,
        DEPOSIT_STATUS.rejected,
      ]),
      note: z.string().trim().optional(),
    })
    .superRefine((data, ctx) => {
      if (data.status === DEPOSIT_STATUS.rejected && !data.note) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['note'],
          message: 'Note is required when rejecting deposit',
        });
      }
    }),
});

export const DepositValidation = {
  submitDepositValidationSchema,
  depositIdParamValidationSchema,
  verifyDepositValidationSchema,
};




