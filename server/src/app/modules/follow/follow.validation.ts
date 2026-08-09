import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const followVendorValidationSchema = z.object({
  params: z.object({
    vendorId: objectIdSchema,
  }),
});

export const FollowValidation = {
  followVendorValidationSchema,
};


