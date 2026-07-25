import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const jobIdParamValidationSchema = z.object({
  params: z.object({
    jobId: objectIdSchema,
  }),
});

const orderIdParamValidationSchema = z.object({
  params: z.object({
    orderId: objectIdSchema,
  }),
});

export const JobValidation = {
  jobIdParamValidationSchema,
  orderIdParamValidationSchema,
};


