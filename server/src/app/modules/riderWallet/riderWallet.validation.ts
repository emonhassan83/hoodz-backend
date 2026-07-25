import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const withdrawRequestValidationSchema = z.object({
  body: z.object({
    amount: z.number().positive(),
    note: z.string().trim().optional(),
  }),
});

const withdrawIdParamValidationSchema = z.object({
  params: z.object({
    withdrawId: objectIdSchema,
  }),
});

const rejectWithdrawValidationSchema = z.object({
  params: z.object({
    withdrawId: objectIdSchema,
  }),
  body: z.object({
    reason: z.string().trim().min(1),
  }),
});

export const RiderWalletValidation = {
  withdrawRequestValidationSchema,
  withdrawIdParamValidationSchema,
  rejectWithdrawValidationSchema,
};


