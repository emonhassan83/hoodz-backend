import { z } from 'zod';

import { SEARCH_TYPE } from '@/app/modules/search/search.constant';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const searchDataValidationSchema = z.object({
  query: z.object({
    searchTerm: z.string().trim().min(1, 'Search term is required'),
    limit: z
      .string()
      .optional()
      .or(z.number().int().positive().optional()),
  }),
});

const insertSearchValidationSchema = z.object({
  body: z.object({
    modelType: z.nativeEnum(SEARCH_TYPE),
    refId: objectIdSchema,
  }),
});

const deleteSearchValidationSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});

export const SearchValidation = {
  searchDataValidationSchema,
  insertSearchValidationSchema,
  deleteSearchValidationSchema,
};
