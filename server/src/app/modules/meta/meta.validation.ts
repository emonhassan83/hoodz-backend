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
};
