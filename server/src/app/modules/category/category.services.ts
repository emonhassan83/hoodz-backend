import {
  assertCategoryExists,
  assertCategoryTitleAvailable,
  createCategory,
  deleteCategoryById,
  findCategories,
  updateCategoryById,
} from '@/app/modules/category/category.helpers';
import { TCategoryPayload } from '@/app/modules/category/category.types';
import {
  deleteCache,
  deleteCachePattern,
  getCache,
  setCache,
} from '@/app/redis/helpers';
import { REDIS_KEYS } from '@/app/redis/keys';

/** Creates a category and invalidates category/product caches. */
const create = async (
  traceId: string,
  payload: TCategoryPayload
) => {
  await assertCategoryTitleAvailable(traceId, payload.title);

  const category = await createCategory(payload);
  await Promise.all([
    deleteCache(REDIS_KEYS.CATEGORY_LIST),
    deleteCachePattern('product:*'),
  ]);

  return category;
};

/** Returns cached categories or reads fresh data from MongoDB. */
const getAll = async () => {
  const cached = await getCache(REDIS_KEYS.CATEGORY_LIST);
  if (cached) return cached;

  const categories = await findCategories();
  await setCache(REDIS_KEYS.CATEGORY_LIST, categories, 600);
  return categories;
};

/** Updates a category and invalidates category/product caches. */
const updateA = async (
  traceId: string,
  categoryId: string,
  payload: Partial<TCategoryPayload>
) => {
  if (payload.title) {
    await assertCategoryTitleAvailable(traceId, payload.title, categoryId);
  }

  const category = await updateCategoryById(categoryId, payload);
  assertCategoryExists(category, traceId);
  await Promise.all([
    deleteCache(REDIS_KEYS.CATEGORY_LIST),
    deleteCachePattern('product:*'),
  ]);

  return category;
};

/** Deletes a category and invalidates category/product caches. */
const deleteA = async (traceId: string, categoryId: string) => {
  const category = await deleteCategoryById(categoryId);
  assertCategoryExists(category, traceId);
  await Promise.all([
    deleteCache(REDIS_KEYS.CATEGORY_LIST),
    deleteCachePattern('product:*'),
  ]);

  return category;
};

export const CategoryService = {
  create,
  getAll,
  updateA,
  deleteA,
};

