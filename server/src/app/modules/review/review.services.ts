import { HttpStatusCode } from 'axios';
import { Types } from 'mongoose';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import { CoinService } from '@/app/modules/coin/coin.services';
import { Orders } from '@/app/modules/orders/orders.model';
import { REVIEW_MODEL_TYPE } from '@/app/modules/review/review.constant';
import { NOTIFICATION_MODEL_TYPE } from '@/app/modules/notification/notification.constant';
import {
  getDeliveredJobForReviewOrThrow,
  resolveReviewAuthorOrThrow,
  resolveReviewSort,
  reviewListPopulate,
  reviewListSelect,
  toReviewCards,
} from '@/app/modules/review/review.helpers';
import { Review } from '@/app/modules/review/review.model';
import { TCreateReviewPayload } from '@/app/modules/review/review.types';
import { sendNotificationViaQueue } from '@/app/utils/notification-queue.service';

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

  if (payload.modelType === REVIEW_MODEL_TYPE.Job) {
    await sendNotificationViaQueue({
      userId: author.toString(),
      channel: 'both',
      title: 'New ride rating',
      message: `A customer rated your delivery ${payload.rating} stars.`,
      data: {
        modelType: NOTIFICATION_MODEL_TYPE.Job,
        reference: payload.reference,
        reviewId: review._id.toString(),
        notice: 'ride-rating',
      },
    }).catch((error) => {
      console.warn('[Review] Failed to queue rider rating notification', error);
    });
  }

  return Review.findById(review._id).populate(reviewPopulate).select('-__v');
};

/** Creates a job review from a delivered ride using jobId. */
const createFromJob = async (
  traceId: string,
  userId: string,
  payload: { jobId: string; rating: number; review: string; files?: string[] }
) => {
  const job = await getDeliveredJobForReviewOrThrow(traceId, payload.jobId);
  let customerId = job.user?.toString();
  if (!customerId && job.order) {
    const order = await Orders.findById(job.order).select('user');
    customerId = order?.user?.toString();
  }
  if (customerId !== userId) {
    throw new ApiError(
      HttpStatusCode.Forbidden,
      'Only the customer can rate this ride',
      traceId
    );
  }

  return create(traceId, userId, {
    modelType: REVIEW_MODEL_TYPE.Job,
    reference: job._id.toString(),
    rating: payload.rating,
    review: payload.review,
    files: payload.files ?? [],
  });
};

/** Returns paginated reviews written for one author. */
const getReviewByAuthor = async (
  authorId: string,
  query: Record<string, unknown>
) => {
  const restQuery = { ...query };
  delete restQuery.sort;

  const reviewQuery = new QueryBuilder(
    Review.find({ author: authorId })
      .populate(reviewListPopulate)
      .select(reviewListSelect)
      .lean(),
    {
      ...restQuery,
      sort: resolveReviewSort(query.sort),
    }
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const [reviews, meta] = await Promise.all([
    reviewQuery.modelQuery,
    reviewQuery.countTotal(),
  ]);

  return { meta, data: toReviewCards(reviews as Array<Record<string, any>>) };
};

/** Returns product review summary, rating breakdown, and a paginated review list. */
const getReviewByProduct = async (
  productId: string,
  query: Record<string, unknown>
) => {
  const restQuery = { ...query };
  delete restQuery.sort;

  const reviewQuery = new QueryBuilder(
    Review.find({ modelType: REVIEW_MODEL_TYPE.Product, reference: productId })
      .populate(reviewListPopulate)
      .select(reviewListSelect)
      .lean(),
    {
      ...restQuery,
      sort: resolveReviewSort(query.sort),
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
      reviews: toReviewCards(reviews as Array<Record<string, any>>),
    },
  };
};

export const ReviewService = {
  create,
  createFromJob,
  getReviewByAuthor,
  getReviewByProduct,
};
