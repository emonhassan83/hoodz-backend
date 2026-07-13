import { z } from 'zod';

import {
  ALLOWED_KEYS,
  GENERAL_KEYS,
} from '@/app/modules/settings/settings.constant';

export type TGeneralKey = (typeof GENERAL_KEYS)[number];

const latitudeSchema = z.number().min(-90).max(90);
const longitudeSchema = z.number().min(-180).max(180);

const platformLocationSchema = z.object({
  address: z.string().trim().min(1, 'Platform address is required').optional(),
  latitude: latitudeSchema,
  longitude: longitudeSchema,
});

const platformLocationAddressSchema = z
  .string()
  .trim()
  .min(1, 'Platform location address is required');

// Create or Update Single Setting
export const createOrUpdateSettingZodSchema = z
  .object({
    params: z.object({
      key: z.enum(ALLOWED_KEYS as unknown as [string, ...string[]], {
        message: 'Invalid setting key provided',
      }),
    }),
    body: z.object({
      value: z.any(),
      name: z.string().trim().optional(),
    }),
  })
  .superRefine(({ params, body }, context) => {
    if (params.key === 'platformLocation') {
      const result = platformLocationSchema.safeParse(body.value);
      if (!result.success) {
        result.error.issues.forEach((issue) =>
          context.addIssue({ ...issue, path: ['body', 'value', ...issue.path] })
        );
      }
    }

    if (params.key === 'platformLocationAddress') {
      const result = platformLocationAddressSchema.safeParse(body.value);
      if (!result.success) {
        result.error.issues.forEach((issue) =>
          context.addIssue({ ...issue, path: ['body', 'value', ...issue.path] })
        );
      }
    }

    if (params.key === 'deliveryCharge') {
      const result = z
        .union([
          z.number().nonnegative(),
          z.object({ ratePerKm: z.number().nonnegative() }),
        ])
        .safeParse(body.value);
      if (!result.success) {
        context.addIssue({
          code: 'custom',
          path: ['body', 'value'],
          message: 'Delivery charge must be a non-negative per-kilometre rate',
        });
      }
    }

  });

// Update Multiple General Settings
export const updateGeneralsZodSchema = z.object({
  body: z
    .object({
      platformLocation: platformLocationSchema.optional(),
      platformLocationAddress: platformLocationAddressSchema.optional(),
      deliveryCharge: z.number().nonnegative().optional(),

      privacyAndPolicy: z.string().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one general setting value must be provided',
    }),
});

export const SettingValidation = {
  createOrUpdateSettingZodSchema,
  updateGeneralsZodSchema,
};
