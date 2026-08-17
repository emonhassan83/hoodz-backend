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
import {
  calculateDistanceKm,
  getGoogleDistanceMatrix,
} from '@/app/modules/user/user.helpers';

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
        isDeleted: false,
        $expr: {
          $eq: [{ $toLower: { $ifNull: ['$brandType', ''] } }, brandType.toLowerCase()],
        },
      },
    },
    {
      $addFields: {
        categoryId: {
          $convert: {
            input: '$category',
            to: 'objectId',
            onError: '$category',
            onNull: null,
          },
        },
      },
    },
    {
      $group: {
        _id: '$categoryId',
        productCount: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: Category.collection.name,
        localField: '_id',
        foreignField: '_id',
        as: 'category',
      },
    },
    { $unwind: { path: '$category', preserveNullAndEmptyArrays: false } },
    { $sort: { productCount: -1, 'category.title': 1 } },
    {
      $project: {
        _id: '$category._id',
        title: '$category.title',
        icon: '$category.icon',
      },
    },
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
        profileAvatar: '$shop.profileAvatar',
        avgRating: { $ifNull: ['$shop.avgRating', 0] },
        ratingCount: { $ifNull: ['$shop.ratingCount', 0] },
        followers: { $ifNull: ['$shop.followers', 0] },
        location: '$shop.location',
      },
    },
    { $sort: { avgRating: -1, ratingCount: -1, name: 1 } },
  ]);
};

const GOOGLE_DESTINATION_LIMIT = 25;

const parseShopOrigin = (query: TCategoryShopQuery) => {
  const latitude = Number(query.latitude ?? query.lat);
  const longitude = Number(query.longitude ?? query.lng ?? query.lang);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
};

const getGoogleDistanceElements = async (
  origin: { latitude: number; longitude: number },
  destinations: { latitude: number; longitude: number }[]
) => {
  const elements: Array<{
    status?: string;
    distance?: { value?: number; text?: string };
    duration?: { value?: number; text?: string };
  }> = [];

  try {
    for (let i = 0; i < destinations.length; i += GOOGLE_DESTINATION_LIMIT) {
      const chunk = destinations.slice(i, i + GOOGLE_DESTINATION_LIMIT);
      const chunkElements = await getGoogleDistanceMatrix(origin, chunk);
      elements.push(...chunkElements);
    }
  } catch (error) {
    console.warn(
      '[Category shops] Google Maps distance lookup failed:',
      error instanceof Error ? error.message : error
    );
  }

  return elements;
};

const toShopCard = (
  shop: Record<string, any>,
  distance: number | null,
  eta: number | null
) => ({
  _id: shop._id,
  name: shop.name,
  profileAvatar: shop.profileAvatar ?? null,
  avgRating: shop.avgRating ?? 0,
  ratingCount: shop.ratingCount ?? 0,
  followers: shop.followers ?? 0,
  distance,
  eta,
});

/** Attaches Google driving distance/eta to category shops using lat/lng. */
export const withShopDistance = async (
  shops: Array<Record<string, any>>,
  query: TCategoryShopQuery
) => {
  const origin = parseShopOrigin(query);
  if (!origin) {
    return shops.map((shop) => toShopCard(shop, null, null));
  }

  const shopsWithCoordinates = shops.map((shop) => {
    const [longitude, latitude] = shop.location?.coordinates ?? [0, 0];
    const hasLocation = longitude !== 0 || latitude !== 0;
    return {
      shop,
      coordinate: hasLocation ? { latitude, longitude } : null,
    };
  });

  const destinations = shopsWithCoordinates
    .map((item) => item.coordinate)
    .filter(Boolean) as { latitude: number; longitude: number }[];
  const googleElements = await getGoogleDistanceElements(origin, destinations);

  let googleIndex = 0;
  const result = shopsWithCoordinates.map(({ shop, coordinate }) => {
    if (!coordinate) return toShopCard(shop, null, null);

    const element = googleElements[googleIndex++];
    const fallbackKm = Number(calculateDistanceKm(origin, coordinate).toFixed(2));
    const distance =
      element?.status === 'OK' && element.distance?.value !== undefined
        ? Number((element.distance.value / 1000).toFixed(2))
        : fallbackKm;
    const eta =
      element?.status === 'OK' && element.duration?.value !== undefined
        ? Math.ceil(element.duration.value / 60)
        : null;

    return toShopCard(shop, distance, eta);
  });

  return result.sort((a, b) => {
    if (a.distance === null) return 1;
    if (b.distance === null) return -1;
    return a.distance - b.distance;
  });
};


