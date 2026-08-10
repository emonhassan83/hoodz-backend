import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const walletTransactionIdParamValidationSchema = z.object({
  params: z.object({
    transactionId: objectIdSchema,
  }),
});

const refundToCardValidationSchema = z.object({
  body: z.object({
    savedCardId: objectIdSchema,
    amount: z.number().positive('Amount must be greater than 0'),
  }),
});

export const WalletTransactionValidation = {
  walletTransactionIdParamValidationSchema,
  refundToCardValidationSchema,
};
