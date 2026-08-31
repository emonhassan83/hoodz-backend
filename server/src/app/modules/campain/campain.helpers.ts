import { HttpStatusCode } from 'axios';
import { Types } from 'mongoose';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import { Banner } from '@/app/modules/banner/banner.model';
import { Campain } from '@/app/modules/campain/campain.model';
import { Product } from '@/app/modules/product/product.model';

export const campainPopulate = [
  { path: 'banner', select: 'banner reference section status type' },
  {
    path: 'products',
    select:
      'title banner price discountPrice avgRating ratingCount collectionType stock',
  },
];

/** Throws when a campaign was not found. */
export const assertCampainExists = (campain: unknown, traceId: string) => {
  if (!campain) {
    throw new ApiError(HttpStatusCode.NotFound, 'Campaign not found', traceId);
  }
};

/** Ensures banner and products exist before create/update. */
export const assertCampainReferences = async (
  traceId: string,
  payload: { banner?: string; products?: string[] }
) => {
  if (payload.banner) {
    const banner = await Banner.findById(payload.banner).select('_id');
    if (!banner) {
      throw new ApiError(HttpStatusCode.NotFound, 'Banner not found', traceId);
    }
  }

  const productIds = [...new Set(payload.products ?? [])];
  if (!productIds.length) return;

  const existingCount = await Product.countDocuments({
    _id: { $in: productIds },
    isDeleted: false,
  });

  if (existingCount !== productIds.length) {
    throw new ApiError(
      HttpStatusCode.NotFound,
      'One or more products were not found',
      traceId
    );
  }
};

/** Returns paginated campaigns. */
export const findCampains = async (query: Record<string, unknown>) => {
  const campainQuery = new QueryBuilder(
    Campain.find().populate(campainPopulate).select('-__v').lean(),
    query
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const [data, meta] = await Promise.all([
    campainQuery.modelQuery,
    campainQuery.countTotal(),
  ]);

  return { meta, data };
};

/** Returns one campaign by banner id. */
export const findCampainByBanner = (bannerId: string) =>
  Campain.findOne({ banner: new Types.ObjectId(bannerId) })
    .populate(campainPopulate)
    .select('-__v')
    .lean();
