import {
  assertBannerExists,
  createBanner,
  deleteBannerById,
  findBanners,
} from '@/app/modules/banner/banner.helpers';
import { TBannerPayload } from '@/app/modules/banner/banner.types';

/** Adds a new banner. */
const add = async (_traceId: string, payload: TBannerPayload) =>
  createBanner(payload);

/** Returns every banner for app display. */
const viewAllBanner = async () => findBanners();

/** Removes one banner by id. */
const remove = async (traceId: string, bannerId: string) => {
  const banner = await deleteBannerById(bannerId);
  assertBannerExists(banner, traceId);

  return banner;
};

export const BannerService = {
  add,
  viewAllBanner,
  remove,
};

