import { z } from 'zod';

import {
  ADMIN_SETTING_KEYS,
  SETTING_TIME_UNIT,
} from '@/app/modules/settings/settings.constant';

const positiveIntegerSchema = z.number().int().nonnegative();
const weekdaySchema = z.enum([
  'sun',
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
]);
const settingTimeUnitSchema = z.enum([
  SETTING_TIME_UNIT.minute,
  SETTING_TIME_UNIT.hour,
  SETTING_TIME_UNIT.day,
]);
const timeValueSchema = z.object({
  time: positiveIntegerSchema,
  unit: settingTimeUnitSchema,
});
const clockTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be HH:mm');

const timeValueToMinutes = (value?: z.infer<typeof timeValueSchema>) => {
  if (!value) return null;

  const multipliers = {
    [SETTING_TIME_UNIT.minute]: 1,
    [SETTING_TIME_UNIT.hour]: 60,
    [SETTING_TIME_UNIT.day]: 1440,
  } as const;

  return value.time * multipliers[value.unit];
};

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
      returnPolicyTime: timeValueSchema.optional(),
      deliveryMinTime: timeValueSchema.optional(),
      deliveryMaxTime: timeValueSchema.optional(),
      instantDeliveryMinTime: timeValueSchema.optional(),
      instantDeliveryMaxTime: timeValueSchema.optional(),
      isInstantDeliveryAvailable: z.boolean().optional(),
      openingTime: clockTimeSchema.optional(),
      closingTime: clockTimeSchema.optional(),
      weekends: z.array(weekdaySchema).optional(),
      timezone: z.string().trim().min(1).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one general setting value must be provided',
    })
    .superRefine((data, context) => {
      const deliveryMinMinutes = timeValueToMinutes(data.deliveryMinTime);
      const deliveryMaxMinutes = timeValueToMinutes(data.deliveryMaxTime);
      const instantMinMinutes = timeValueToMinutes(data.instantDeliveryMinTime);
      const instantMaxMinutes = timeValueToMinutes(data.instantDeliveryMaxTime);

      if (deliveryMinMinutes !== null && deliveryMaxMinutes !== null && deliveryMinMinutes > deliveryMaxMinutes) {
        context.addIssue({
          code: 'custom',
          path: ['deliveryMaxTime'],
          message: 'deliveryMaxTime must be greater than or equal to deliveryMinTime',
        });
      }

      if (instantMinMinutes !== null && instantMaxMinutes !== null && instantMinMinutes > instantMaxMinutes) {
        context.addIssue({
          code: 'custom',
          path: ['instantDeliveryMaxTime'],
          message:
            'instantDeliveryMaxTime must be greater than or equal to instantDeliveryMinTime',
        });
      }
    }),
});

export const SettingValidation = {
  createOrUpdateSettingZodSchema,
  updateGeneralsZodSchema,
};

