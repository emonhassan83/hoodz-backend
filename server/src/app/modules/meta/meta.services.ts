import {
  getHomeBanners,
  getLastPaidActiveOrder,
  getNearbyBrands,
  parseOriginFromQuery,
  resolveUserOrigin,
  toHomeProductCards,
} from '@/app/modules/meta/meta.helpers';
import {
  TGuestMetaPayload,
  TMetaLocationQuery,
  TUserMetaPayload,
} from '@/app/modules/meta/meta.types';
import { ProductService } from '@/app/modules/product/product.services';

const getUserMeta = async (
  userId: string,
  query: TMetaLocationQuery
): Promise<TUserMetaPayload> => {
  const actor = { userId };
  const origin = await resolveUserOrigin(userId, query);

  const [
    banners,
    lastOrder,
    nearbyBrands,
    recentlyViewed,
    trending,
    aiRecommended,
  ] = await Promise.all([
    getHomeBanners(),
    getLastPaidActiveOrder(userId),
    getNearbyBrands(origin),
    ProductService.getRecentlyViewedProducts(actor, { page: 1, limit: 10 }),
    ProductService.getTrendingProducts({ page: 1, limit: 2 }, userId),
    ProductService.getAiRecommendedProducts(actor, { page: 1, limit: 2 }),
  ]);

  return {
    firstSectionBanner: banners.firstSectionBanner,
    lastOrder,
    nearbyBrands,
    recentlyViwed: toHomeProductCards(recentlyViewed.data),
    trandingProducts: toHomeProductCards(trending.data),
    secondSectionBanner: banners.secondSectionBanner,
    aiRecommandedProducts: toHomeProductCards(aiRecommended.data),
  };
};

const getGuestMeta = async (
  query: TMetaLocationQuery,
  guestId?: string
): Promise<TGuestMetaPayload> => {
  const actor = guestId ? { guestId } : {};
  const origin = parseOriginFromQuery(query);

  const [banners, nearbyBrands, recentlyViewed, trending, aiRecommended] =
    await Promise.all([
      getHomeBanners(),
      getNearbyBrands(origin),
      guestId
        ? ProductService.getRecentlyViewedProducts(actor, {
            page: 1,
            limit: 10,
          })
        : Promise.resolve({ data: [] }),
      ProductService.getTrendingProducts({ page: 1, limit: 2 }),
      ProductService.getAiRecommendedProducts(actor, { page: 1, limit: 2 }),
    ]);

  return {
    firstSectionBanner: banners.firstSectionBanner,
    nearbyBrands,
    recentlyViwed: toHomeProductCards(recentlyViewed.data),
    trandingProducts: toHomeProductCards(trending.data),
    secondSectionBanner: banners.secondSectionBanner,
    aiRecommandedProducts: toHomeProductCards(aiRecommended.data),
  };
};

export const MetaService = {
  getUserMeta,
  getGuestMeta,
};
