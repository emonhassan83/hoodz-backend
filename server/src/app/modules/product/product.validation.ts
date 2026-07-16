import { z } from 'zod';

import { COLLECTION_TYPE } from '@/app/modules/product/product.constant';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const colorSchema = z.object({
  code: z.string().trim().min(1, 'Color code is required'),
  name: z.string().trim().min(1, 'Color name is required'),
});

const variantSchema = z.object({
  size: z.string().trim().min(1, 'Size is required'),
  color: colorSchema,
  quantity: z.number().int().nonnegative(),
});

const seoSchema = z.object({
  metaTitle: z.string().trim().optional(),
  metaDescription: z.string().trim().optional(),
  metaKeywords: z.array(z.string().trim().min(1)).optional(),
  ratingValue: z.number().nonnegative().optional(),
});

const baseProductSchema = {
  category: objectIdSchema,
  sku: z.string().trim().min(1, 'SKU is required'),
  collectionType: z.enum(Object.values(COLLECTION_TYPE) as [string, ...string[]]),
  brand: z.string().trim().min(1, 'Brand is required'),
  title: z.string().trim().min(1, 'Title is required'),
  description: z.string().trim().min(1, 'Description is required'),
  images: z.array(z.string().trim().min(1)).min(1, 'At least one image is required'),
  price: z.number().nonnegative(),
  discount: z.number().min(0).max(100).default(0),
  variants: z.array(variantSchema).min(1, 'At least one variant is required'),
  seo: seoSchema.optional(),
};

const createProductValidationSchema = z.object({
  body: z.object(baseProductSchema).strip(),
});

const updateProductValidationSchema = z.object({
  body: z
    .object({
      category: objectIdSchema.optional(),
      sku: z.string().trim().min(1, 'SKU is required').optional(),
      collectionType: z
        .enum(Object.values(COLLECTION_TYPE) as [string, ...string[]])
        .optional(),
      brand: z.string().trim().min(1, 'Brand is required').optional(),
      title: z.string().trim().min(1, 'Title is required').optional(),
      description: z.string().trim().min(1, 'Description is required').optional(),
      images: z.array(z.string().trim().min(1)).min(1).optional(),
      price: z.number().nonnegative().optional(),
      discount: z.number().min(0).max(100).optional(),
      variants: z.array(variantSchema).min(1).optional(),
      seo: seoSchema.optional(),
    })
    .strip()
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field is required',
    }),
});

export const ProductValidation = {
  createProductValidationSchema,
  updateProductValidationSchema,
};
