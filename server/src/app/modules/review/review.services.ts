import { HttpStatusCode } from 'axios';
import { Types } from 'mongoose';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import { CoinService } from '@/app/modules/coin/coin.services';
import {
  REVIEW_MODEL_TYPE,
  REVIEW_PRODUCT_FILTER,
} from '@/app/modules/review/review.constant';
import { resolveReviewAuthorOrThrow } from '@/app/modules/review/review.helpers';
import { Review } from '@/app/modules/review/review.model';
import { TCreateReviewPayload } from '@/app/modules/review/review.types';

const reviewPopulate = [
  { path: 'user', select: 'name email phone profileAvatar' },
  { path: 'author', select: 'name email phone profileAvatar avgRating ratingCount role' },
  { path: 'reference' },
];

/** Creates a review and auto-resolves the reviewed author. */
const create = async (
  traceId: string,
  userId: string,
  payload: TCreateReviewPayload
) => {
  const author = await resolveReviewAuthorOrThrow(traceId, payload);
  if (author.toString() === userId) {
    throw new ApiError(HttpStatusCode.BadRequest, 'You cannot review yourself', traceId);
  }

  const alreadyReviewed = await Review.exists({
    user: userId,
    modelType: payload.modelType,
    reference: payload.reference,
  });
  if (alreadyReviewed) {
    throw new ApiError(
      HttpStatusCode.Conflict,
      payload.modelType === REVIEW_MODEL_TYPE.Product
        ? 'You have already reviewed this product'
        : 'You have already reviewed this job',
      traceId
    );
  }

  let review;
  try {
    review = await Review.create({
      user: userId,
      author,
      modelType: payload.modelType,
      reference: payload.reference,
      review: payload.review,
      files: payload.files ?? [],
      rating: payload.rating,
    });
  } catch (error) {
    const duplicate =
      (error as { code?: number }).code === 11000;
    if (duplicate) {
      throw new ApiError(
        HttpStatusCode.Conflict,
        payload.modelType === REVIEW_MODEL_TYPE.Product
          ? 'You have already reviewed this product'
          : 'You have already reviewed this job',
        traceId
      );
    }
    throw error;
  }

  if (payload.modelType === REVIEW_MODEL_TYPE.Product) {
    await CoinService.addReviewBonus(
      userId,
      review._id,
      Boolean(payload.files?.length)
    );
  }

  return Review.findById(review._id).populate(reviewPopulate).select('-__v');
};

/** Returns paginated reviews written for one author. */
const getReviewByAuthor = async (
  authorId: string,
  query: Record<string, unknown>
) => {
  const reviewQuery = new QueryBuilder(
    Review.find({ author: authorId })
      .populate(reviewPopulate)
      .select('-__v')
      .lean(),
    query
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const [data, meta] = await Promise.all([
    reviewQuery.modelQuery,
    reviewQuery.countTotal(),
  ]);

  return { meta, data };
};

/** Returns product review summary, rating breakdown, and a paginated review list. */
const getReviewByProduct = async (
  productId: string,
  query: Record<string, unknown>
) => {
  const filter =
    (query.filter as string) || REVIEW_PRODUCT_FILTER.latest;
  const restQuery = { ...query };
  delete restQuery.filter;

  const sortMap: Record<string, string> = {
    [REVIEW_PRODUCT_FILTER.latest]: '-createdAt',
    [REVIEW_PRODUCT_FILTER.highest]: '-rating -createdAt',
    [REVIEW_PRODUCT_FILTER.lowest]: 'rating -createdAt',
  };

  const reviewQuery = new QueryBuilder(
    Review.find({ modelType: REVIEW_MODEL_TYPE.Product, reference: productId })
      .populate(reviewPopulate)
      .select('-__v')
      .lean(),
    {
      ...restQuery,
      sort: sortMap[filter] || sortMap[REVIEW_PRODUCT_FILTER.latest],
    }
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const [reviews, meta, analysis] = await Promise.all([
    reviewQuery.modelQuery,
    reviewQuery.countTotal(),
    Review.aggregate<{
      ratingCount: number;
      avgRating: number;
      excellent: number;
      very_good: number;
      good: number;
      fair: number;
      poor: number;
    }>([
      {
        $match: {
          modelType: REVIEW_MODEL_TYPE.Product,
          reference: new Types.ObjectId(productId),
        },
      },
      {
        $group: {
          _id: null,
          ratingCount: { $sum: 1 },
          avgRating: { $avg: '$rating' },
          excellent: {
            $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] },
          },
          very_good: {
            $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] },
          },
          good: {
            $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] },
          },
          fair: {
            $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] },
          },
          poor: {
            $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] },
          },
        },
      },
    ]),
  ]);

  const stats = analysis[0];

  return {
    meta,
    data: {
      avgRating: Number((stats?.avgRating ?? 0).toFixed(1)),
      ratingCount: stats?.ratingCount ?? 0,
      reviewAnalysis: {
        excellent: stats?.excellent ?? 0,
        very_good: stats?.very_good ?? 0,
        good: stats?.good ?? 0,
        fair: stats?.fair ?? 0,
        poor: stats?.poor ?? 0,
      },
      reviews,
    },
  };
};

export const ReviewService = {
  create,
  getReviewByAuthor,
  getReviewByProduct,
};
