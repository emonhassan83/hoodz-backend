import { z } from 'zod';

import { USER_STATUS } from '@/app/modules/user/user.constant';

const updateUserValidationSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    countryCode: z.string().optional(),
    address: z.string().optional(),
    profileAvatar: z.string().optional()
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
  }),
});


const changeEmailZodSchema = z.object({
  body: z.object({
    email: z
      .string()
      .email({ message: 'Please provide a valid email address' }),
  }),
});

export const UserValidation = {
  updateUserValidationSchema,
  changeStatusValidationSchema,
  updateLocationValidationSchema,
  changeEmailZodSchema,
};
