import { HttpStatusCode } from 'axios';
import { Types } from 'mongoose';

import ApiError from '@/app/errors/ApiError';
import { Category } from '@/app/modules/category/category.model';
import {
  TCategoryPayload,
  TCategoryShopQuery,
} from '@/app/modules/category/category.types';
import { PRODUCT_BRAND_TYPE } from '@/app/modules/product/product.constant';
import { Product } from '@/app/modules/product/product.model';
import { USER_ROLE } from '@/app/modules/user/user.constant';

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

export const assertValidBrandType = (brandType: string, traceId: string) => {
  if (!(Object.values(PRODUCT_BRAND_TYPE) as string[]).includes(brandType)) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Invalid brand type', traceId);
  }
};

export const assertValidObjectId = (
  value: string,
  field: string,
  traceId: string
) => {
  if (!Types.ObjectId.isValid(value)) {
    throw new ApiError(HttpStatusCode.BadRequest, `Invalid ${field}`, traceId);
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

/** Returns categories that have products under a selected brand type. */
export const findCategoriesByBrandType = (brandType: string) =>
  Product.aggregate([
    {
      $match: {
        brandType,
        isDeleted: false,
      },
    },
    {
      $group: {
        _id: '$category',
        productCount: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: 'categories',
        localField: '_id',
        foreignField: '_id',
        as: 'category',
      },
    },
    { $unwind: '$category' },
    {
      $project: {
        _id: '$category._id',
        title: '$category.title',
        icon: '$category.icon',
        productCount: 1,
      },
    },
    { $sort: { productCount: -1, title: 1 } },
  ]);

/** Returns shops/vendors that use a category, optionally scoped by brand type. */
export const findShopsByCategory = (
  categoryId: string,
  query: TCategoryShopQuery
) => {
  const match: Record<string, unknown> = {
    category: new Types.ObjectId(categoryId),
    isDeleted: false,
  };

  if (query.brandType) match.brandType = query.brandType;

  return Product.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$vendor',
        productCount: { $sum: 1 },
        brandTypes: { $addToSet: '$brandType' },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'shop',
      },
    },
    { $unwind: '$shop' },
    {
      $match: {
        'shop.role': USER_ROLE.vendor,
        'shop.isDeleted': false,
      },
    },
    {
      $project: {
        _id: '$shop._id',
        name: '$shop.name',
        email: '$shop.email',
        phone: '$shop.phone',
        profileAvatar: '$shop.profileAvatar',
        coverPhoto: '$shop.coverPhoto',
        description: '$shop.description',
        location: '$shop.location',
        address: '$shop.address',
        avgRating: '$shop.avgRating',
        ratingCount: '$shop.ratingCount',
        followers: '$shop.followers',
        productCount: 1,
        brandTypes: 1,
      },
    },
    { $sort: { avgRating: -1, ratingCount: -1, productCount: -1, name: 1 } },
  ]);
};


