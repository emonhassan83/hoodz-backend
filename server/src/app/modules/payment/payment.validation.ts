import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const confirmPaymentValidationSchema = z.object({
  body: z.object({
    paymentId: objectIdSchema,
    transactionId: z.string().trim().min(1).optional(),
    paymentIntentId: z.string().trim().min(1).optional(),
    success: z.boolean().optional(),
  }),
});

export const PaymentValidation = {
  confirmPaymentValidationSchema,
};

