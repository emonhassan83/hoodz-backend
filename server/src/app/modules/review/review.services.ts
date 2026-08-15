import { HttpStatusCode } from 'axios';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import { CoinService } from '@/app/modules/coin/coin.services';
import { REVIEW_MODEL_TYPE } from '@/app/modules/review/review.constant';
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

  const review = await Review.create({
    user: userId,
    author,
    modelType: payload.modelType,
    reference: payload.reference,
    review: payload.review,
    files: payload.files ?? [],
    rating: payload.rating,
  });

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

/** Returns paginated reviews for one product. */
const getReviewByProduct = async (
  productId: string,
  query: Record<string, unknown>
) => {
  const reviewQuery = new QueryBuilder(
    Review.find({ modelType: REVIEW_MODEL_TYPE.Product, reference: productId })
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

export const ReviewService = {
  create,
  getReviewByAuthor,
  getReviewByProduct,
};
