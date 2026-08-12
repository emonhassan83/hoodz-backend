import {
  assertCategoryExists,
  assertCategoryTitleAvailable,
  assertValidBrandType,
  assertValidObjectId,
  createCategory,
  deleteCategoryById,
  findCategoriesByBrandType,
  findCategories,
  findShopsByCategory,
  updateCategoryById,
} from '@/app/modules/category/category.helpers';
import {
  TCategoryPayload,
  TCategoryShopQuery,
} from '@/app/modules/category/category.types';
import {
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
    deleteCachePattern(`${REDIS_KEYS.CATEGORY_LIST}*`),
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

/** Returns product categories available under a product brand type. */
const getCategoryByBrandType = async (traceId: string, brandType: string) => {
  assertValidBrandType(brandType, traceId);

  const cacheKey = `${REDIS_KEYS.CATEGORY_LIST}:brand-type:${brandType}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const categories = await findCategoriesByBrandType(brandType);
  await setCache(cacheKey, categories, 300);
  return categories;
};

/** Returns shops/vendors that have products in a category. */
const getCategoryByShop = async (
  traceId: string,
  categoryId: string,
  query: TCategoryShopQuery
) => {
  assertValidObjectId(categoryId, 'category id', traceId);
  if (query.brandType) assertValidBrandType(query.brandType, traceId);

  const cacheKey = `${REDIS_KEYS.CATEGORY_LIST}:shops:${categoryId}:${query.brandType ?? 'all'}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const shops = await findShopsByCategory(categoryId, query);
  await setCache(cacheKey, shops, 300);
  return shops;
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
    deleteCachePattern(`${REDIS_KEYS.CATEGORY_LIST}*`),
    deleteCachePattern('product:*'),
  ]);

  return category;
};

/** Deletes a category and invalidates category/product caches. */
const deleteA = async (traceId: string, categoryId: string) => {
  const category = await deleteCategoryById(categoryId);
  assertCategoryExists(category, traceId);
  await Promise.all([
    deleteCachePattern(`${REDIS_KEYS.CATEGORY_LIST}*`),
    deleteCachePattern('product:*'),
  ]);

  return category;
};

export const CategoryService = {
  create,
  getAll,
  getCategoryByBrandType,
  getCategoryByShop,
  updateA,
  deleteA,
};


