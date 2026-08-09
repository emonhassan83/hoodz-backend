import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const setupSavedCardValidationSchema = z.object({
  body: z
    .object({
      setDefault: z.boolean().optional(),
    })
    .optional()
    .default({}),
});

const savedCardIdParamValidationSchema = z.object({
  params: z.object({
    cardId: objectIdSchema,
  }),
});

export const SavedCardValidation = {
  setupSavedCardValidationSchema,
  savedCardIdParamValidationSchema,
};
