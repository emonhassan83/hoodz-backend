import { z } from 'zod';

import { JOB_ASSIGNMENT_TYPE } from '@/app/constant';
import {
  JOB_DEPOSIT_STATUS,
  JOB_PAYMENT_METHOD,
} from '@/app/modules/job/job.constant';

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

const jobListQuerySchema = z.object({
  filter: z.enum(['active', 'completed']).optional(),
  isDepositSubmitted: z
    .enum(['true', 'false', '1', '0'])
    .or(z.boolean())
    .optional(),
  paymentMethod: z
    .enum([
      JOB_PAYMENT_METHOD.card,
      JOB_PAYMENT_METHOD.wallet,
      JOB_PAYMENT_METHOD.cod,
    ])
    .optional(),
  depositStatus: z
    .enum([
      JOB_DEPOSIT_STATUS.not_required,
      JOB_DEPOSIT_STATUS.pending,
      JOB_DEPOSIT_STATUS.submitted,
      JOB_DEPOSIT_STATUS.verified,
    ])
    .optional(),
  assignmentType: z
    .enum([JOB_ASSIGNMENT_TYPE.agent, JOB_ASSIGNMENT_TYPE.auto])
    .optional(),
});

const getMyJobsQueryValidationSchema = z.object({
  query: jobListQuerySchema,
});

const getRiderJobsQueryValidationSchema = z.object({
  params: z.object({
    riderId: objectIdSchema,
  }),
  query: jobListQuerySchema,
});

const riderIdParamValidationSchema = z.object({
  params: z.object({
    riderId: objectIdSchema,
  }),
});

export const JobValidation = {
  jobIdParamValidationSchema,
  orderIdParamValidationSchema,
  riderIdParamValidationSchema,
  getMyJobsQueryValidationSchema,
  getRiderJobsQueryValidationSchema,
};
