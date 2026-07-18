import { z } from 'zod';

import {
  ADMIN_SETTING_KEYS,
} from '@/app/modules/settings/settings.constant';

const positiveIntegerSchema = z.number().int().nonnegative();

const deliveryChargeSchema = z
  .array(
    z.object({
      state: z.string().trim().min(1, 'State is required'),
      regularDeliveryCharge: z.number().nonnegative(),
      instantDeliveryCharge: z.number().nonnegative(),
    })
  )
  .min(1, 'At least one delivery charge is required');

// Create or Update Single Setting
export const createOrUpdateSettingZodSchema = z
  .object({
    params: z.object({
      key: z.enum(ADMIN_SETTING_KEYS as unknown as [string, ...string[]], {
        message: 'Invalid setting key provided',
      }),
    }),
    body: z.object({
      value: z.any(),
    }),
  })
  .superRefine(({ params, body }, context) => {
    const dynamicBody = body as Record<string, unknown>;
    const value = body.value ?? dynamicBody[params.key];

    if (params.key === 'deliveryCharge') {
      const result = deliveryChargeSchema.safeParse(value);
      if (!result.success) {
        result.error.issues.forEach((issue) =>
          context.addIssue({ ...issue, path: ['body', ...issue.path] })
        );
      }
      return;
    }

    if (typeof value !== 'string') {
      context.addIssue({
        code: 'custom',
        path: ['body', body.value === undefined ? params.key : 'value'],
        message: 'Admin legal setting value must be a string',
      });
    }
  });

// Update Multiple General Settings
export const updateGeneralsZodSchema = z.object({
  body: z
    .object({
      returnPolicyDays: positiveIntegerSchema.optional(),
      deliveryMinDays: positiveIntegerSchema.optional(),
      deliveryMaxDays: positiveIntegerSchema.optional(),
      instantDeliveryMaxDays: positiveIntegerSchema.optional(),
      instantDeliveryMinDays: positiveIntegerSchema.optional(),
      isInstantDeliveryAvailable: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one general setting value must be provided',
    })
    .superRefine((data, context) => {
      if (
        data.deliveryMinDays !== undefined &&
        data.deliveryMaxDays !== undefined &&
        data.deliveryMinDays > data.deliveryMaxDays
      ) {
        context.addIssue({
          code: 'custom',
          path: ['deliveryMaxDays'],
          message: 'deliveryMaxDays must be greater than or equal to deliveryMinDays',
        });
      }

      if (
        data.instantDeliveryMinDays !== undefined &&
        data.instantDeliveryMaxDays !== undefined &&
        data.instantDeliveryMinDays > data.instantDeliveryMaxDays
      ) {
        context.addIssue({
          code: 'custom',
          path: ['instantDeliveryMaxDays'],
          message:
            'instantDeliveryMaxDays must be greater than or equal to instantDeliveryMinDays',
        });
      }
    }),
});

export const SettingValidation = {
  createOrUpdateSettingZodSchema,
  updateGeneralsZodSchema,
};
