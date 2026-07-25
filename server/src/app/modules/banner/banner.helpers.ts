import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { Banner } from '@/app/modules/banner/banner.model';
import { TBannerPayload } from '@/app/modules/banner/banner.types';

/** Creates a banner document. */
export const createBanner = (payload: TBannerPayload) =>
  Banner.create(payload);

/** Returns all banners newest first. */
export const findBanners = () =>
  Banner.find().sort({ createdAt: -1 }).select('-__v').lean();

/** Deletes one banner by id. */
export const deleteBannerById = (bannerId: string) =>
  Banner.findByIdAndDelete(bannerId).select('-__v');

/** Throws when a banner was not found. */
export const assertBannerExists = (banner: unknown, traceId: string) => {
  if (!banner) {
    throw new ApiError(HttpStatusCode.NotFound, 'Banner not found', traceId);
  }
};

