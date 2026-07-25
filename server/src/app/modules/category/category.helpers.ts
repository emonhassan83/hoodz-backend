import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { Category } from '@/app/modules/category/category.model';
import { TCategoryPayload } from '@/app/modules/category/category.types';

export const assertCategoryTitleAvailable = async (
  traceId: string,
  title: string,
  excludeCategoryId?: string
) => {
  const exists = await Category.findOne({
    title,
    ...(excludeCategoryId ? { _id: { $ne: excludeCategoryId } } : {}),
  });

  if (exists) {
    throw new ApiError(HttpStatusCode.Conflict, 'Category already exists', traceId);
  }
};

export const assertCategoryExists = (category: unknown, traceId: string) => {
  if (!category) {
    throw new ApiError(HttpStatusCode.NotFound, 'Category not found', traceId);
  }
};

export const createCategory = (payload: TCategoryPayload) =>
  Category.create(payload);

export const findCategories = () =>
  Category.find().sort({ createdAt: -1 }).select('-__v').lean();

export const updateCategoryById = (
  categoryId: string,
  payload: Partial<TCategoryPayload>
) =>
  Category.findByIdAndUpdate(categoryId, payload, {
    returnDocument: 'after',
  }).select('-__v');

export const deleteCategoryById = (categoryId: string) =>
  Category.findByIdAndDelete(categoryId).select('-__v');

