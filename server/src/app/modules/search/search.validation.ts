import { z } from 'zod';

import { SEARCH_SOURCE } from '@/app/modules/search/search.constant';

const searchDataValidationSchema = z.object({
  query: z.object({
    searchTerm: z.string().trim().min(1, 'Search term is required'),
  }),
});

const insertSearchValidationSchema = z.object({
  body: z.object({
    query: z.string().trim().min(1, 'Search query is required'),
    source: z.nativeEnum(SEARCH_SOURCE).optional(),
  }),
});

const deleteSearchValidationSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id'),
  }),
});

export const SearchValidation = {
  searchDataValidationSchema,
  insertSearchValidationSchema,
  deleteSearchValidationSchema,
};

