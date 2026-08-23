import { z } from 'zod';

import {
  GRIEVANCE_RESOLUTION_TYPE,
  GRIEVANCE_STATUS,
} from '@/app/modules/grievance/grievance.constant';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const createGrievanceValidationSchema = z.object({
  body: z.object({
    order: objectIdSchema,
    issueType: z.string().trim().min(1),
    description: z.string().trim().min(3),
    files: z.array(z.string().trim().min(1)).optional(),
  }),
});

const resolveGrievanceValidationSchema = z.object({
  params: z.object({
    grievanceId: objectIdSchema,
  }),
  body: z.object({
    status: z.enum(Object.values(GRIEVANCE_STATUS) as [string, ...string[]]),
    resolutionType: z
      .enum(Object.values(GRIEVANCE_RESOLUTION_TYPE) as [string, ...string[]])
      .optional(),
    note: z.string().trim().optional(),
  }),
});

const grievanceIdParamValidationSchema = z.object({
  params: z.object({
    grievanceId: objectIdSchema,
  }),
});

export const GrievanceValidation = {
  createGrievanceValidationSchema,
  resolveGrievanceValidationSchema,
  grievanceIdParamValidationSchema,
};
