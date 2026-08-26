import { USER_ROLE } from '@/app/modules/user/user.constant';
import { z } from 'zod';

const latitudeSchema = z.coerce.number().min(-90).max(90);
const longitudeSchema = z.coerce.number().min(-180).max(180);

const locationQueryShape = {
  latitude: latitudeSchema.optional(),
  longitude: longitudeSchema.optional(),
  lat: latitudeSchema.optional(),
  lng: longitudeSchema.optional(),
  lang: longitudeSchema.optional(),
};

const hasLatitude = (data: {
  latitude?: number;
  lat?: number;
}) => data.latitude !== undefined || data.lat !== undefined;

const hasLongitude = (data: {
  longitude?: number;
  lng?: number;
  lang?: number;
}) =>
  data.longitude !== undefined ||
  data.lng !== undefined ||
  data.lang !== undefined;

const getUserMetaValidationSchema = z.object({
  query: z.object(locationQueryShape).passthrough(),
});

const getGuestMetaValidationSchema = z.object({
  query: z
    .object(locationQueryShape)
    .passthrough()
    .refine((data) => hasLatitude(data) && hasLongitude(data), {
      message: 'lat and lng are required',
    }),
});

export const MetaValidation = {
  getUserMetaValidationSchema,
  getGuestMetaValidationSchema,
  getAdminMetaValidationSchema: z.object({
    query: z
      .object({
        year: z.coerce.number().int().min(2000).max(2100).optional(),
        role: z
          .enum([USER_ROLE.user, USER_ROLE.vendor, USER_ROLE.rider])
          .optional(),
      })
      .passthrough(),
  }),
  getVendorMetaValidationSchema: z.object({
    query: z
      .object({
        ordersEarninigFilter: z.coerce
          .number()
          .int()
          .min(2000)
          .max(2100)
          .optional(),
        ordersCountFilter: z.coerce
          .number()
          .int()
          .min(2000)
          .max(2100)
          .optional(),
        year: z.coerce.number().int().min(2000).max(2100).optional(),
      })
      .passthrough(),
  }),
};
