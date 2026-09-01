import { HttpStatusCode } from 'axios';
import { Types } from 'mongoose';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import { Banner } from '@/app/modules/banner/banner.model';
import { Campain } from '@/app/modules/campain/campain.model';
import { Product } from '@/app/modules/product/product.model';

export const campainPopulate = [
  {
    path: 'products',
    select:
      'title banner price discountPrice avgRating ratingCount collectionType stock',
  },
];

/** Drops legacy banner unique index left from the old campaign schema. */
let campainIndexesReady = false;

export const ensureCampainIndexes = async () => {
  if (campainIndexesReady) return;

  const indexes = await Campain.collection.indexes();
  const legacyBannerIndex = indexes.find((index) => index.key?.banner === 1);
  if (legacyBannerIndex?.name) {
    await Campain.collection.dropIndex(legacyBannerIndex.name);
  }

  await Campain.syncIndexes();
  campainIndexesReady = true;
};

/** Throws when a campaign was not found. */
export const assertCampainExists = (campain: unknown, traceId: string) => {
  if (!campain) {
    throw new ApiError(HttpStatusCode.NotFound, 'Campaign not found', traceId);
  }
};

/** Ensures products exist before create/update. */
export const assertCampainReferences = async (
  traceId: string,
  payload: { products?: string[] }
) => {
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

/** Returns one campaign linked to a banner via banner.reference. */
export const findCampainByBanner = async (traceId: string, bannerId: string) => {
  const banner = await Banner.findById(bannerId).select('reference').lean();
  if (!banner) {
    throw new ApiError(HttpStatusCode.NotFound, 'Banner not found', traceId);
  }

  if (!banner.reference || !Types.ObjectId.isValid(banner.reference)) {
    throw new ApiError(
      HttpStatusCode.NotFound,
      'Campaign not found for this banner',
      traceId
    );
  }

  return Campain.findById(banner.reference)
    .populate(campainPopulate)
    .select('-__v')
    .lean();
};
