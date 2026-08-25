import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const colorSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
});

const posOrderItemSchema = z.object({
  product: objectIdSchema,
  variant: z
    .object({
      size: z.string().trim().nullable().optional(),
      color: colorSchema.nullable().optional(),
    })
    .optional(),
  quantity: z.number().int().positive(),
});

const posOrderQuoteBodySchema = z.object({
  items: z.array(posOrderItemSchema).min(1),
  discount: z.number().min(0).max(100).optional(),
  tax: z.number().min(0).max(100).optional(),
});

const createPosOrderValidationSchema = z.object({
  body: posOrderQuoteBodySchema,
});

const posOrderSummaryValidationSchema = z.object({
  body: posOrderQuoteBodySchema,
});

const updatePosOrderValidationSchema = z.object({
  params: z.object({
    posOrderId: objectIdSchema,
  }),
  body: z.object({
    discount: z.number().min(0).max(100),
    tax: z.number().min(0).max(100),
  }),
});

const posOrderIdParamValidationSchema = z.object({
  params: z.object({
    posOrderId: objectIdSchema,
  }),
});

export const PosOrderValidation = {
  createPosOrderValidationSchema,
  posOrderSummaryValidationSchema,
  updatePosOrderValidationSchema,
  posOrderIdParamValidationSchema,
};
