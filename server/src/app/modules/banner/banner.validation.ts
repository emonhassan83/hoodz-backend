import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const addBannerValidationSchema = z.object({
  body: z.object({
    banner: z.string().trim().min(1, 'Banner is required'),
    reference: z.string().trim().min(1, 'Reference is required'),
  }),
});

const removeBannerValidationSchema = z.object({
  params: z.object({
    bannerId: objectIdSchema,
  }),
});

export const BannerValidation = {
  addBannerValidationSchema,
  removeBannerValidationSchema,
};

