import { z } from 'zod';

import { TOP_UP_PAYMENT_METHOD } from '@/app/modules/topUp/topUp.constant';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const addWalletMoneyValidationSchema = z.object({
  body: z.object({
    amount: z.number().positive('Amount must be greater than 0'),
    paymentMethod: z.literal(TOP_UP_PAYMENT_METHOD.card),
    savedCardId: objectIdSchema.optional(),
    saveCard: z.boolean().optional(),
  }),
});

export const TopUpValidation = {
  addWalletMoneyValidationSchema,
};
