import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const vendorIdQueryValidationSchema = z.object({
  query: z
    .object({
      vendorId: objectIdSchema,
      page: z.string().optional(),
      limit: z.string().optional(),
      sort: z.string().optional(),
    })
    .passthrough(),
});

export const VendorTransctionValidation = {
  vendorIdQueryValidationSchema,
};
