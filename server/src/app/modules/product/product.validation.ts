import { z } from 'zod';

import {
  COLLECTION_TYPE,
  PRODUCT_BRAND_TYPE,
  PRODUCT_INVENTORY_TYPE,
  STOCK_FILTER,
} from '@/app/modules/product/product.constant';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const colorSchema = z.object({
  code: z.string().trim().min(1, 'Color code is required'),
  name: z.string().trim().min(1, 'Color name is required'),
});

const variantSchema = z.object({
  size: z.string().trim().min(1, 'Size is required').nullable().optional(),
  color: colorSchema.nullable().optional(),
  quantity: z.number().int().nonnegative(),
});

const inventoryTypeSchema = z.enum(
  Object.values(PRODUCT_INVENTORY_TYPE) as [string, ...string[]]
);
const brandTypeSchema = z.enum(
  Object.values(PRODUCT_BRAND_TYPE) as [string, ...string[]]
);

const validateInventoryShape = (
  data: {
    inventoryType?: string;
    stock?: number;
    variants?: Array<{ size?: string | null; color?: unknown; quantity: number }>;
  },
  ctx: z.RefinementCtx
) => {
  if (!data.inventoryType) return;

  if (data.inventoryType === PRODUCT_INVENTORY_TYPE.single) {
    if (typeof data.stock !== 'number') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stock'],
        message: 'Stock is required for single inventory products',
      });
    }
    return;
  }

  if (!data.variants || data.variants.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['variants'],
      message: 'At least one inventory option is required',
    });
    return;
  }

  data.variants.forEach((variant, index) => {
    if (
      data.inventoryType === PRODUCT_INVENTORY_TYPE.sizeColor &&
      !variant.size
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['variants', index, 'size'],
        message: 'Size is required for size_color inventory products',
      });
    }

    if (!variant.color) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['variants', index, 'color'],
        message: 'Color is required for option based inventory products',
      });
    }
  });
};

const seoSchema = z.object({
  metaTitle: z.string().trim().optional(),
  metaDescription: z.string().trim().optional(),
  metaKeywords: z.array(z.string().trim().min(1)).optional(),
  ratingValue: z.number().nonnegative().optional(),
});

const baseProductSchema = {
  category: objectIdSchema,
  sku: z.string().trim().min(1, 'SKU is required'),
  inventoryType: inventoryTypeSchema,
  collectionType: z.enum(Object.values(COLLECTION_TYPE) as [string, ...string[]]),
  brand: z.string().trim().min(1, 'Brand is required'),
  brandType: brandTypeSchema.default(PRODUCT_BRAND_TYPE.local),
  title: z.string().trim().min(1, 'Title is required'),
  titleArabic: z.string().trim().min(1, 'Arabic title is required').nullable().optional(),
  description: z.string().trim().min(1, 'Description is required'),
  descriptionArabic: z.string().trim().min(1, 'Arabic description is required').nullable().optional(),
  banner: z.string().trim().min(1).nullable().optional(),
  images: z.array(z.string().trim().min(1)).optional(),
  price: z.number().nonnegative(),
  discount: z.number().min(0).max(100).default(0),
  stock: z.number().int().nonnegative().optional(),
  variants: z.array(variantSchema).optional(),
  seo: seoSchema.optional(),
};

const createProductValidationSchema = z.object({
  body: z.object(baseProductSchema).strip().superRefine(validateInventoryShape),
});

const createProductByAdminValidationSchema = z.object({
  body: z
    .object({
      vendor: objectIdSchema,
      ...baseProductSchema,
    })
    .strip()
    .superRefine(validateInventoryShape),
});

const updateProductValidationSchema = z.object({
  body: z
    .object({
      category: objectIdSchema.optional(),
      sku: z.string().trim().min(1, 'SKU is required').optional(),
      inventoryType: inventoryTypeSchema.optional(),
      collectionType: z
        .enum(Object.values(COLLECTION_TYPE) as [string, ...string[]])
        .optional(),
      brand: z.string().trim().min(1, 'Brand is required').optional(),
      brandType: brandTypeSchema.optional(),
      title: z.string().trim().min(1, 'Title is required').optional(),
      titleArabic: z.string().trim().min(1, 'Arabic title is required').nullable().optional(),
      description: z.string().trim().min(1, 'Description is required').optional(),
      descriptionArabic: z.string().trim().min(1, 'Arabic description is required').nullable().optional(),
      banner: z.string().trim().min(1).nullable().optional(),
      images: z.array(z.string().trim().min(1)).optional(),
      price: z.number().nonnegative().optional(),
      discount: z.number().min(0).max(100).optional(),
      stock: z.number().int().nonnegative().optional(),
      variants: z.array(variantSchema).optional(),
      seo: seoSchema.optional(),
    })
    .strip()
    .superRefine(validateInventoryShape)
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field is required',
    }),
});

const markProductViewedValidationSchema = z.object({
  params: z.object({
    productId: objectIdSchema,
  }),
});

const notifyMeValidationSchema = z.object({
  params: z.object({
    productId: objectIdSchema,
  }),
});

const shopProductsValidationSchema = z.object({
  params: z.object({
    vendorId: objectIdSchema,
  }),
  query: z.object({
    searchTerm: z.string().trim().optional(),
    category: z.string().trim().optional(),
    categoryId: z.string().trim().optional(),
    categories: z.string().trim().optional(),
    minPrice: z.coerce.number().optional(),
    maxPrice: z.coerce.number().optional(),
    color: z.string().trim().optional(),
    size: z.string().trim().optional(),
    gender: z.string().trim().optional(),
    collectionType: z.string().trim().optional(),
    brand: z.string().trim().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).optional(),
    sort: z.string().optional(),
  }).passthrough(),
});

const searchShopProductsValidationSchema = z.object({
  params: z.object({
    vendorId: objectIdSchema,
  }),
  query: z.object({
    searchTerm: z.string().trim().min(1, 'Search term is required'),
  }).passthrough(),
});

const getMyProductsValidationSchema = z.object({
  query: z.object({
    searchTerm: z.string().trim().optional(),
    stockFilter: z
      .enum([
        STOCK_FILTER.low,
        STOCK_FILTER.inStock,
        STOCK_FILTER.outStock,
      ])
      .optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).optional(),
    sort: z.string().optional(),
  }),
});

export const ProductValidation = {
  createProductValidationSchema,
  createProductByAdminValidationSchema,
  updateProductValidationSchema,
  markProductViewedValidationSchema,
  shopProductsValidationSchema,
  searchShopProductsValidationSchema,
  notifyMeValidationSchema,
  getMyProductsValidationSchema,
};


