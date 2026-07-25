import { z } from 'zod';

const createCategoryValidationSchema = z.object({
  body: z.object({
    title: z.string().trim().min(1, 'Title is required'),
    icon: z.string().trim().min(1, 'Icon is required'),
  }),
});

const updateCategoryValidationSchema = z.object({
  body: z
    .object({
      title: z.string().trim().min(1, 'Title is required').optional(),
      icon: z.string().trim().min(1, 'Icon is required').optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field is required',
    }),
});

export const CategoryValidation = {
  createCategoryValidationSchema,
  updateCategoryValidationSchema,
};

