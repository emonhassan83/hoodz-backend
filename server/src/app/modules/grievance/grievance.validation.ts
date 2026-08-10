import { z } from 'zod';

import {
  GRIEVANCE_ISSUE_TYPE,
  GRIEVANCE_RESOLUTION_TYPE,
  GRIEVANCE_STATUS,
} from '@/app/modules/grievance/grievance.constant';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const createGrievanceValidationSchema = z.object({
  body: z.object({
    orderId: objectIdSchema,
    issueType: z.enum(
      Object.values(GRIEVANCE_ISSUE_TYPE) as [string, ...string[]]
    ),
    description: z.string().trim().min(3),
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
    compensationVoucher: objectIdSchema.nullable().optional(),
    refundAmount: z.number().min(0).optional(),
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
