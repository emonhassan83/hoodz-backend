import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const createCampainValidationSchema = z.object({
  body: z.object({
    title: z.string().trim().min(1, 'Title is required'),
    banner: objectIdSchema,
    products: z.array(objectIdSchema).optional().default([]),
  }),
});

const updateCampainValidationSchema = z.object({
  params: z.object({
    campainId: objectIdSchema,
  }),
  body: z
    .object({
      title: z.string().trim().min(1).optional(),
      banner: objectIdSchema.optional(),
      products: z.array(objectIdSchema).optional(),
    })
    .refine((body) => Object.keys(body).length > 0, {
      message: 'At least one field is required',
    }),
});

const bannerIdParamValidationSchema = z.object({
  params: z.object({
    bannerId: objectIdSchema,
  }),
});

const campainIdParamValidationSchema = z.object({
  params: z.object({
    campainId: objectIdSchema,
  }),
});

export const CampainValidation = {
  createCampainValidationSchema,
  updateCampainValidationSchema,
  bannerIdParamValidationSchema,
  campainIdParamValidationSchema,
};
