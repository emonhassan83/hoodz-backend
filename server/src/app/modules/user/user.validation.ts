import { z } from 'zod';

import { USER_STATUS } from '@/app/modules/user/user.constant';

const geoPointSchema = z.object({
  type: z.literal('Point').optional(),
  coordinates: z.tuple([
    z.number().min(-180, 'Longitude must be at least -180').max(180),
    z.number().min(-90, 'Latitude must be at least -90').max(90),
  ]),
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
    deliveryAddress: z.string().optional(),
    deliveryLocation: geoPointSchema.optional(),
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
  body: z.object({
    longitude: z.number({
      message: 'longitude is required!',
    }),
    latitude: z.number({
      message: 'latitude is required!',
    }),
    deliveryAddress: z
      .string()
      .min(1, { message: 'Delivery address cannot be empty.' }),
  }),
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

const invitePlatformUserValidationSchema = z.object({
  body: z.object({
    name: z.string().min(1, { message: 'Name is required.' }),
    email: z.string().email({ message: 'Invalid email address.' }),
    countryCode: z.string().min(1, { message: 'Country code is required.' }),
    phone: z.string().min(1, { message: 'Phone is required.' }),
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

export const UserValidation = {
  updateUserValidationSchema,
  changeStatusValidationSchema,
  updateLocationValidationSchema,
  updateDeliveryLocationValidationSchema,
  securityCodeValidationSchema,
  verifySecurityCodeValidationSchema,
  inviteVendorValidationSchema: invitePlatformUserValidationSchema,
  inviteAgentValidationSchema: invitePlatformUserValidationSchema,
  changeEmailZodSchema,
  nearbyShopsValidationSchema,
};
