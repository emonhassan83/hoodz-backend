import { z } from 'zod';

import { deliveryAddressSchema } from '@/app/modules/user/user.validation';

const saveLocationValidationSchema = z.object({
  body: deliveryAddressSchema,
});

const locationIdParamValidationSchema = z.object({
  params: z.object({
    locationId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid location id'),
  }),
});

export const SavedLocationValidation = {
  saveLocationValidationSchema,
  locationIdParamValidationSchema,
};
