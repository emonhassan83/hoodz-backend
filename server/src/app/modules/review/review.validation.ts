import { z } from 'zod';

import { REVIEW_MODEL_TYPE } from '@/app/modules/review/review.constant';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const createReviewValidationSchema = z.object({
  body: z.object({
    modelType: z.enum(Object.values(REVIEW_MODEL_TYPE) as [string, ...string[]]),
    reference: objectIdSchema,
    review: z.string().trim().min(2),
    files: z.array(z.string().trim().min(1)).optional(),
    rating: z.number().min(1).max(5),
  }),
});

const authorIdParamValidationSchema = z.object({
  params: z.object({
    authorId: objectIdSchema,
  }),
});

const productIdParamValidationSchema = z.object({
  params: z.object({
    productId: objectIdSchema,
  }),
});

export const ReviewValidation = {
  createReviewValidationSchema,
  authorIdParamValidationSchema,
  productIdParamValidationSchema,
};
