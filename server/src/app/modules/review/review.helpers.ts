import { Types } from 'mongoose';
import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { JOB_STATUS } from '@/app/modules/job/job.constant';
import { Job } from '@/app/modules/job/job.model';
import { Product } from '@/app/modules/product/product.model';
import { REVIEW_SORT_MAP } from '@/app/constant';
import {
  REVIEW_MODEL_TYPE,
  REVIEW_SORT,
} from '@/app/modules/review/review.constant';
import { TCreateReviewPayload, TReviewCard } from '@/app/modules/review/review.types';

/** Loads a delivered job by mongo id or public job id. */
export const getDeliveredJobForReviewOrThrow = async (
  traceId: string,
  jobId: string
) => {
  const filters: Array<Record<string, string>> = [{ id: jobId }];
  if (/^[0-9a-fA-F]{24}$/.test(jobId)) {
    filters.unshift({ _id: jobId });
  }

  const job = await Job.findOne({ $or: filters }).select('rider user status id order');
  if (!job) {
    throw new ApiError(HttpStatusCode.NotFound, 'Job not found', traceId);
  }
  if (job.status !== JOB_STATUS.delivered) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'You can only review a delivered job',
      traceId
    );
  }
  if (!job.rider) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Job has no assigned rider', traceId);
  }

  return job;
};

/** Resolves the reviewed author from the reference document. */
export const resolveReviewAuthorOrThrow = async (
  traceId: string,
  payload: Pick<TCreateReviewPayload, 'modelType' | 'reference'>
): Promise<Types.ObjectId> => {
  if (payload.modelType === REVIEW_MODEL_TYPE.Product) {
    const product = await Product.findOne({
      _id: payload.reference,
      isDeleted: false,
    }).select('vendor');
    if (!product?.vendor) {
      throw new ApiError(HttpStatusCode.NotFound, 'Product not found', traceId);
    }

    return product.vendor as Types.ObjectId;
  }

  const job = await getDeliveredJobForReviewOrThrow(traceId, payload.reference);
  return job.rider as Types.ObjectId;
};

/** Maps `latest|highest|lowest` to a mongoose sort string. */
export const resolveReviewSort = (sort?: unknown) =>
  REVIEW_SORT_MAP[sort as string] || REVIEW_SORT_MAP[REVIEW_SORT.latest];

export const reviewListPopulate = [
  { path: 'user', select: 'name profileAvatar' },
];

export const reviewListSelect = '_id user modelType review files rating createdAt';

/** Shapes review list cards for author and product endpoints. */
export const toReviewCards = (
  reviews: Array<Record<string, any>> = []
): TReviewCard[] =>
  reviews.map((item) => ({
    _id: item._id,
    user: {
      _id: item.user?._id ?? item.user,
      name: item.user?.name ?? '',
      profileAvatar: item.user?.profileAvatar ?? null,
    },
    modelType: item.modelType,
    review: item.review,
    files: item.files ?? [],
    rating: item.rating,
    createdAt: item.createdAt,
  }));
