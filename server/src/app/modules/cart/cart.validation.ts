import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const cartColorSchema = z.object({
  code: z.string().trim().min(1, 'Color code is required'),
  name: z.string().trim().min(1, 'Color name is required'),
});

const addCartItemValidationSchema = z.object({
  body: z.object({
    productId: objectIdSchema,
    size: z.string().trim().min(1, 'Size is required'),
    color: cartColorSchema,
    quantity: z.number().int().positive().default(1),
  }),
});

const updateCartItemValidationSchema = z.object({
  body: z.object({
    productId: objectIdSchema,
    size: z.string().trim().min(1, 'Size is required'),
    color: cartColorSchema,
    quantity: z.number().int().positive(),
  }),
});

const removeCartItemValidationSchema = z.object({
  body: z.object({
    productId: objectIdSchema,
    size: z.string().trim().min(1, 'Size is required'),
    color: cartColorSchema,
  }),
});

export const CartValidation = {
  addCartItemValidationSchema,
  updateCartItemValidationSchema,
  removeCartItemValidationSchema,
};
