import { z } from 'zod';

import {
  BANNER_STATUS,
  SECTION_TYPE,
} from '@/app/modules/banner/banner.constant';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const bannerStatusSchema = z.enum([
  BANNER_STATUS.active,
  BANNER_STATUS.inactive,
]);
const sectionTypeSchema = z.enum([SECTION_TYPE.first, SECTION_TYPE.second]);

const addBannerValidationSchema = z.object({
  body: z.object({
    banner: z.string().trim().min(1, 'Banner is required'),
    reference: z.string().trim().min(1).nullable().optional(),
    section: sectionTypeSchema,
    status: bannerStatusSchema.optional(),
  }),
});

const updateBannerValidationSchema = z.object({
  params: z.object({
    bannerId: objectIdSchema,
  }),
  body: z
    .object({
      banner: z.string().trim().min(1).optional(),
      reference: z.string().trim().min(1).nullable().optional(),
      section: sectionTypeSchema.optional(),
      status: bannerStatusSchema.optional(),
    })
    .refine(body => Object.keys(body).length > 0, {
      message: 'At least one field is required',
    }),
});

const toggleBannerStatusValidationSchema = z.object({
  params: z.object({
    bannerId: objectIdSchema,
  }),
  body: z
    .object({
      status: bannerStatusSchema.optional(),
    })
    .optional()
    .default({}),
});

const removeBannerValidationSchema = z.object({
  params: z.object({
    bannerId: objectIdSchema,
  }),
});

export const BannerValidation = {
  addBannerValidationSchema,
  updateBannerValidationSchema,
  toggleBannerStatusValidationSchema,
  removeBannerValidationSchema,
};

