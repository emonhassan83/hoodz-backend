import { z } from 'zod';

import { WITHDRAW_STATUS } from '@/app/modules/withdraw/withdraw.constant';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const addWithdrawValidationSchema = z.object({
  body: z.object({
    amount: z.number().positive('Amount must be greater than 0'),
    note: z.string().trim().optional(),
  }),
});

const changeWithdrawStatusValidationSchema = z.object({
  params: z.object({
    withdrawId: objectIdSchema,
  }),
  body: z.object({
    status: z.enum(Object.values(WITHDRAW_STATUS) as [string, ...string[]]),
    note: z.string().trim().optional(),
    files: z.array(z.string().trim().min(1)).optional().default([]),
  }),
});

const withdrawIdParamValidationSchema = z.object({
  params: z.object({
    withdrawId: objectIdSchema,
  }),
});

export const WithdrawValidation = {
  addWithdrawValidationSchema,
  changeWithdrawStatusValidationSchema,
  withdrawIdParamValidationSchema,
};
