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

const riderIdParamValidationSchema = z.object({
  params: z.object({
    riderId: objectIdSchema,
  }),
});

const getMyJobsQueryValidationSchema = z.object({
  query: z.object({
    filter: z.enum(['active', 'completed']).optional(),
  }),
});

export const JobValidation = {
  jobIdParamValidationSchema,
  orderIdParamValidationSchema,
  riderIdParamValidationSchema,
  getMyJobsQueryValidationSchema,
};
