import { z } from 'zod';

const yearSchema = z.coerce.number().int().min(2000).max(2100).optional();

const getDashboardValidationSchema = z.object({
  query: z
    .object({
      revenueFilter: yearSchema,
      orderFilter: yearSchema,
      categoryFilter: yearSchema,
      performenceFilter: yearSchema,
      performanceFilter: yearSchema,
    })
    .passthrough(),
});

export const AnalysisValidation = {
  getDashboardValidationSchema,
};
