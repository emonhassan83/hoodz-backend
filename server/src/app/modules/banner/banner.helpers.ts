import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { BANNER_STATUS } from '@/app/modules/banner/banner.constant';
import { Banner } from '@/app/modules/banner/banner.model';
import {
  TBannerPayload,
  TToggleBannerStatusPayload,
  TUpdateBannerPayload,
} from '@/app/modules/banner/banner.types';

/** Creates a banner document. */
export const createBanner = (payload: TBannerPayload) =>
  Banner.create(payload);

/** Returns all banners newest first. */
export const findBanners = () =>
  Banner.find().sort({ createdAt: -1 }).select('-__v').lean();

/** Deletes one banner by id. */
export const deleteBannerById = (bannerId: string) =>
  Banner.findByIdAndDelete(bannerId).select('-__v');

/** Updates editable banner fields. */
export const updateBannerById = (
  bannerId: string,
  payload: TUpdateBannerPayload
) => Banner.findByIdAndUpdate(bannerId, payload, { new: true }).select('-__v');

/** Flips status or applies an explicit banner status. */
export const toggleBannerStatusById = async (
  bannerId: string,
  payload: TToggleBannerStatusPayload = {}
) => {
  const banner = await Banner.findById(bannerId);

  if (!banner) {
    return null;
  }

  banner.status =
    payload.status ??
    (banner.status === BANNER_STATUS.active
      ? BANNER_STATUS.inactive
      : BANNER_STATUS.active);

  await banner.save();

  return Banner.findById(banner._id).select('-__v');
};

/** Throws when a banner was not found. */
export const assertBannerExists = (banner: unknown, traceId: string) => {
  if (!banner) {
    throw new ApiError(HttpStatusCode.NotFound, 'Banner not found', traceId);
  }
};

