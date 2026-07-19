import { z } from 'zod';

import { KYC_STATUS, VEHICLE } from '@/app/modules/kyc/kyc.constant';

const addKycRequestValidationSchema = z.object({
  body: z.object({
    vehicle: z.enum(Object.values(VEHICLE) as [string, ...string[]], {
      message: 'Invalid vehicle type',
    }),
    license: z
      .array(z.string().trim().min(1, 'License file cannot be empty'))
      .min(1, 'License is required'),
    nationalId: z
      .array(z.string().trim().min(1, 'National ID file cannot be empty'))
      .min(1, 'National ID is required'),
  }),
});

const updateKycValidationSchema = z
  .object({
    body: z
      .object({
        vehicle: z
          .enum(Object.values(VEHICLE) as [string, ...string[]], {
            message: 'Invalid vehicle type',
          })
          .optional(),
        license: z
          .array(z.string().trim().min(1, 'License file cannot be empty'))
          .min(1, 'License is required')
          .optional(),
        nationalId: z
          .array(z.string().trim().min(1, 'National ID file cannot be empty'))
          .min(1, 'National ID is required')
          .optional(),
      })
      .strip(),
  })
  .refine(({ body }) => Object.keys(body).length > 0, {
    message: 'At least one KYC field is required',
  });

const changeKycStatusValidationSchema = z
  .object({
    body: z.object({
      status: z.enum(
        [KYC_STATUS.pending, KYC_STATUS.approved, KYC_STATUS.rejected],
        { message: 'Invalid KYC status' }
      ),
      rejectedReason: z.string().trim().optional(),
    }),
  })
  .superRefine(({ body }, context) => {
    if (body.status === KYC_STATUS.rejected && !body.rejectedReason) {
      context.addIssue({
        code: 'custom',
        path: ['rejectedReason'],
        message: 'Rejected reason is required',
      });
    }
  });

export const KycValidation = {
  addKycRequestValidationSchema,
  updateKycValidationSchema,
  changeKycStatusValidationSchema,
};
