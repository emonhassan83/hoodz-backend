import { z } from 'zod';

import { PAYMENT_METHOD } from '@/app/modules/payment/payment.constant';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const initiatePaymentValidationSchema = z.object({
  body: z.object({
    orderId: objectIdSchema,
    paymentMethod: z.enum(Object.values(PAYMENT_METHOD) as [string, ...string[]]),
    saveCard: z.boolean().optional(),
    savedCardId: objectIdSchema.optional(),
  }),
});

const confirmPaymentValidationSchema = z.object({
  body: z.object({
    paymentId: objectIdSchema,
    transactionId: z.string().trim().min(1).optional(),
    paymentIntentId: z.string().trim().min(1).optional(),
    success: z.boolean().optional(),
  }),
});

export const PaymentValidation = {
  initiatePaymentValidationSchema,
  confirmPaymentValidationSchema,
};

