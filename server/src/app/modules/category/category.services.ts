import {
  assertCategoryExists,
  assertCategoryTitleAvailable,
  createCategory,
  deleteCategoryById,
  findCategories,
  TCategoryPayload,
  updateCategoryById,
} from '@/app/modules/category/category.helpers';

const create = async (
  traceId: string,
  payload: TCategoryPayload
) => {
  await assertCategoryTitleAvailable(traceId, payload.title);

  return createCategory(payload);
};

const getAll = async () => findCategories();

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

  return category;
};

const deleteA = async (traceId: string, categoryId: string) => {
  const category = await deleteCategoryById(categoryId);
  assertCategoryExists(category, traceId);

  return category;
};

export const CategoryService = {
  create,
  getAll,
  updateA,
  deleteA,
};
