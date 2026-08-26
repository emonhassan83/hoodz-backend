import { z } from 'zod';

import { PAYMENT_METHOD } from '@/app/modules/payment/payment.constant';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const initiatePaymentValidationSchema = z.object({
  body: z
    .object({
      orderIds: z.array(objectIdSchema).min(1, 'At least one order is required'),
      paymentMethod: z.enum(
        Object.values(PAYMENT_METHOD) as [string, ...string[]]
      ),
      savedCardId: objectIdSchema.optional(),
      saveCard: z.boolean().optional(),
    })
    .superRefine((data, ctx) => {
      if (data.savedCardId && data.paymentMethod !== PAYMENT_METHOD.card) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['savedCardId'],
          message: 'Saved card can only be used for card payment',
        });
      }

      if (data.saveCard && data.paymentMethod !== PAYMENT_METHOD.card) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['saveCard'],
          message: 'Card can only be saved during card payment',
        });
      }
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

const paymentIdParamValidationSchema = z.object({
  params: z.object({
    paymentId: objectIdSchema,
  }),
});

export const PaymentValidation = {
  initiatePaymentValidationSchema,
  confirmPaymentValidationSchema,
  paymentIdParamValidationSchema,
};

