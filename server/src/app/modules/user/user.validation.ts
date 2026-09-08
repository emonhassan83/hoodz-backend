import { z } from 'zod';

import { USER_STATUS } from '@/app/modules/user/user.constant';

const geoPointSchema = z.object({
  type: z.literal('Point').optional(),
  coordinates: z.tuple([
    z.number().min(-180, 'Longitude must be at least -180').max(180),
    z.number().min(-90, 'Latitude must be at least -90').max(90),
  ]),
});

const optionalNumberSchema = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}, z.number().int().nonnegative().nullable().optional());

export const deliveryAddressSchema = z.object({
  name: z.string().trim().min(1),
  location: geoPointSchema,
  buildingNo: optionalNumberSchema,
  floorNo: optionalNumberSchema,
  apartment: optionalNumberSchema,
  city: z.string().trim().min(1),
  country: z.string().trim().min(1),
});

const updateUserValidationSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    countryCode: z.string().optional(),
    address: z.string().optional(),
    profileAvatar: z.string().optional(),
    description: z.string().optional(),
    gender: z.string().optional(),
    dob: z.coerce.date().optional(),
    deliveryAddress: deliveryAddressSchema.optional(),
    deliveryTime: z.string().optional(),
    deliveryZone: z.array(z.string().min(1)).optional(),
    isProfileSetUp: z.boolean().optional(),
  }),
});

const changeStatusValidationSchema = z.object({
  body: z.object({
    status: z.enum(Object.values(USER_STATUS) as [string, ...string[]], {
      message: 'User status is required!',
    }),
  }),
});

const updateLocationValidationSchema = z.object({
  body: z.object({
    longitude: z.number({
      message: 'longitude is required!',
    }),
    latitude: z.number({
      message: 'latitude is required!',
    }),
    address: z.string().min(1, { message: 'Address cannot be empty.' }),
    timeZone: z.string().optional(),
  }),
});

const updateDeliveryLocationValidationSchema = z.object({
  body: deliveryAddressSchema,
});

const securityCodeValidationSchema = z.object({
  body: z.object({
    password: z.string().min(8, {
      message: 'Password must be at least 8 characters long.',
    }),
    securityCode: z.string().regex(/^\d{6}$/, {
      message: 'Security code must be exactly 6 digits.',
    }),
  }),
});

const verifySecurityCodeValidationSchema = z.object({
  body: z.object({
    securityCode: z.string().regex(/^\d{6}$/, {
      message: 'Security code must be exactly 6 digits.',
    }),
  }),
});

const timeStringSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be HH:mm (24h)');

const invitePlatformUserValidationSchema = z.object({
  body: z.object({
    name: z.string().min(1, { message: 'Name is required.' }),
    email: z.string().email({ message: 'Invalid email address.' }),
    countryCode: z.string().min(1, { message: 'Country code is required.' }),
    phone: z.string().min(1, { message: 'Phone is required.' }),
  }),
});

const inviteAgentValidationSchema = z.object({
  body: invitePlatformUserValidationSchema.shape.body.extend({
    timeZone: z.string().trim().min(1).optional(),
    agentSchedule: z
      .object({
        startTime: timeStringSchema,
        endTime: timeStringSchema,
      })
      .nullable()
      .optional(),
  }),
});

const applyReferralCodeValidationSchema = z.object({
  body: z.object({
    referralCode: z
      .string({ message: 'Referral code is required.' })
      .trim()
      .min(1, { message: 'Referral code cannot be empty.' })
      .toUpperCase(),
  }),
});

const changeEmailZodSchema = z.object({
  body: z.object({
    email: z
      .string()
      .email({ message: 'Please provide a valid email address' }),
  }),
});

const nearbyShopsValidationSchema = z.object({
  query: z.object({
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180),
    limit: z.coerce.number().int().positive().max(50).optional(),
    radiusKm: z.coerce.number().positive().max(1000).optional(),
  }),
});

const shopDetailsValidationSchema = z.object({
  params: z.object({
    vendorId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid vendor id'),
  }),
  query: z
    .object({
      latitude: z.coerce.number().min(-90).max(90).optional(),
      longitude: z.coerce.number().min(-180).max(180).optional(),
      lat: z.coerce.number().min(-90).max(90).optional(),
      lng: z.coerce.number().min(-180).max(180).optional(),
      lang: z.coerce.number().min(-180).max(180).optional(),
    })
    .refine(
      (data) => {
        const hasLatitude = data.latitude !== undefined || data.lat !== undefined;
        const hasLongitude =
          data.longitude !== undefined ||
          data.lng !== undefined ||
          data.lang !== undefined;
        return hasLatitude === hasLongitude;
      },
      {
        message: 'Latitude and longitude must be provided together',
      }
    ),
});

const payVendorValidationSchema = z.object({
  params: z.object({
    vendorId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid vendor id'),
  }),
  body: z.object({
    amount: z.number().positive('Amount must be greater than 0'),
    note: z.string().trim().min(1).nullable().optional(),
    files: z.array(z.string().trim().min(1)).optional().default([]),
  }),
});

const updateAgentScheduleValidationSchema = z.object({
  params: z.object({
    agentId: z.string().min(1, 'Agent id is required'),
  }),
  body: z.union([
    z.object({
      startTime: timeStringSchema,
      endTime: timeStringSchema,
    }),
    z.object({
      startTime: z.null(),
      endTime: z.null(),
    }),
  ]),
});

const agentIdParamValidationSchema = z.object({
  params: z.object({
    agentId: z.string().min(1, 'Agent id is required'),
  }),
});

export const UserValidation = {
  updateUserValidationSchema,
  changeStatusValidationSchema,
  updateLocationValidationSchema,
  updateDeliveryLocationValidationSchema,
  securityCodeValidationSchema,
  verifySecurityCodeValidationSchema,
  inviteVendorValidationSchema: invitePlatformUserValidationSchema,
  inviteAgentValidationSchema,
  applyReferralCodeValidationSchema,
  changeEmailZodSchema,
  nearbyShopsValidationSchema,
  shopDetailsValidationSchema,
  payVendorValidationSchema,
  updateAgentScheduleValidationSchema,
  agentIdParamValidationSchema,
};


