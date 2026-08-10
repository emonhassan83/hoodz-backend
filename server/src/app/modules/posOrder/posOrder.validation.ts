import { z } from 'zod';

import { POS_ORDER_STATUS } from '@/app/modules/posOrder/posOrder.constant';

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

const createPosOrderValidationSchema = z.object({
  body: z.object({
    items: z.array(posOrderItemSchema).min(1),
    subTotal: z.number().min(0),
    discount: z.number().min(0).optional(),
    tax: z.number().min(0).optional(),
    totalCost: z.number().min(0),
  }),
});

const updatePosOrderValidationSchema = z.object({
  params: z.object({
    posOrderId: objectIdSchema,
  }),
  body: z.object({
    subTotal: z.number().min(0).optional(),
    discount: z.number().min(0).optional(),
    tax: z.number().min(0).optional(),
    totalCost: z.number().min(0).optional(),
    status: z.enum(Object.values(POS_ORDER_STATUS) as [string, ...string[]]).optional(),
  }),
});

const posOrderIdParamValidationSchema = z.object({
  params: z.object({
    posOrderId: objectIdSchema,
  }),
});

export const PosOrderValidation = {
  createPosOrderValidationSchema,
  updatePosOrderValidationSchema,
  posOrderIdParamValidationSchema,
};
