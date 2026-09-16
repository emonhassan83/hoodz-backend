import { z } from 'zod';

import { PRODUCT_BRAND_TYPE } from '@/app/modules/product/product.constant';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const brandTypeSchema = z.enum(
  Object.values(PRODUCT_BRAND_TYPE) as [string, ...string[]]
);

const createCategoryValidationSchema = z.object({
  body: z.object({
    title: z.string().trim().min(1, 'Title is required'),
    titleArabic: z.string().trim().min(1, 'Arabic title is required').nullable().optional(),
    icon: z.string().trim().min(1, 'Icon is required'),
    iconArabic: z
      .string()
      .trim()
      .min(1, 'Arabic icon is required')
      .nullable()
      .optional(),
  }),
});

const updateCategoryValidationSchema = z.object({
  body: z
    .object({
      title: z.string().trim().min(1, 'Title is required').optional(),
      titleArabic: z.string().trim().min(1, 'Arabic title is required').nullable().optional(),
      icon: z.string().trim().min(1, 'Icon is required').optional(),
      iconArabic: z
        .string()
        .trim()
        .min(1, 'Arabic icon is required')
        .nullable()
        .optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field is required',
    }),
});

const getCategoryByBrandTypeValidationSchema = z.object({
  query: z.object({
    brandType: brandTypeSchema,
  }),
});

const getCategoryByShopValidationSchema = z.object({
  params: z.object({
    categoryId: objectIdSchema,
  }),
  query: z.object({
    brandType: brandTypeSchema.optional(),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    lang: z.coerce.number().min(-180).max(180).optional(),
  }),
});

export const CategoryValidation = {
  createCategoryValidationSchema,
  updateCategoryValidationSchema,
  getCategoryByBrandTypeValidationSchema,
  getCategoryByShopValidationSchema,
};

