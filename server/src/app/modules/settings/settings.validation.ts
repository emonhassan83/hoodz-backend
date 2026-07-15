import { z } from 'zod';

import {
  ADMIN_SETTING_KEYS,
  GENERAL_KEYS,
} from '@/app/modules/settings/settings.constant';

export type TGeneralKey = (typeof GENERAL_KEYS)[number];

const positiveIntegerSchema = z.number().int().nonnegative();

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
      name: z.string().trim().optional(),
    }),
  })
  .superRefine(({ body }, context) => {
    if (typeof body.value !== 'string') {
      context.addIssue({
        code: 'custom',
        path: ['body', 'value'],
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
