import {
  assertBannerExists,
  createBanner,
  deleteBannerById,
  findBanners,
  toggleBannerStatusById,
  updateBannerById,
} from '@/app/modules/banner/banner.helpers';
import {
  TBannerPayload,
  TToggleBannerStatusPayload,
  TUpdateBannerPayload,
} from '@/app/modules/banner/banner.types';

/** Adds a new banner. */
const add = async (_traceId: string, payload: TBannerPayload) =>
  createBanner(payload);

/** Returns every banner for app display. */
const viewAllBanner = async () => findBanners();

/** Updates one banner by id. */
const update = async (
  traceId: string,
  bannerId: string,
  payload: TUpdateBannerPayload
) => {
  const banner = await updateBannerById(bannerId, payload);
  assertBannerExists(banner, traceId);

  return banner;
};

/** Toggles or sets one banner status. */
const toggleStatus = async (
  traceId: string,
  bannerId: string,
  payload: TToggleBannerStatusPayload = {}
) => {
  const banner = await toggleBannerStatusById(bannerId, payload);
  assertBannerExists(banner, traceId);

  return banner;
};

/** Removes one banner by id. */
const remove = async (traceId: string, bannerId: string) => {
  const banner = await deleteBannerById(bannerId);
  assertBannerExists(banner, traceId);

  return banner;
};

export const BannerService = {
  add,
  viewAllBanner,
  update,
  toggleStatus,
  remove,
};

