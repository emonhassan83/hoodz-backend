import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { Job } from '@/app/modules/job/job.model';
import { Product } from '@/app/modules/product/product.model';
import { REVIEW_MODEL_TYPE } from '@/app/modules/review/review.constant';
import { TCreateReviewPayload } from '@/app/modules/review/review.types';

/** Resolves the reviewed author from the reference document. */
export const resolveReviewAuthorOrThrow = async (
  traceId: string,
  payload: Pick<TCreateReviewPayload, 'modelType' | 'reference'>
) => {
  if (payload.modelType === REVIEW_MODEL_TYPE.Product) {
    const product = await Product.findOne({
      _id: payload.reference,
      isDeleted: false,
    }).select('vendor');
    if (!product) {
      throw new ApiError(HttpStatusCode.NotFound, 'Product not found', traceId);
    }

    return product.vendor;
  }

  const job = await Job.findById(payload.reference).select('rider');
  if (!job) {
    throw new ApiError(HttpStatusCode.NotFound, 'Job not found', traceId);
  }

  if (!job.rider) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Job has no assigned rider', traceId);
  }

  return job.rider;
};
