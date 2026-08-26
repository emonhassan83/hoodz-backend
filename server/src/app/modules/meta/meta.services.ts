import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import {
  getAdminDashboardStats,
  getAdminJoinedUsers,
  getAdminRecentOrders,
  getAdminUserGrowth,
  getHomeBanners,
  getLastPaidActiveOrder,
  getNearbyBrands,
  getRiderAssignJobs,
  getRiderJobStats,
  getRiderUnreadNotificationCount,
  getVendorDashboardStats,
  getVendorOrderCountAnalysis,
  getVendorOrderEarningAnalysis,
  parseOriginFromQuery,
  resolveUserOrigin,
  toHomeProductCards,
} from '@/app/modules/meta/meta.helpers';
import {
  TAdminMetaPayload,
  TAdminMetaQuery,
  TGuestMetaPayload,
  TMetaLocationQuery,
  TRiderMetaPayload,
  TUserMetaPayload,
  TVendorMetaPayload,
  TVendorMetaQuery,
} from '@/app/modules/meta/meta.types';
import { User } from '@/app/modules/user/user.model';
import { ProductService } from '@/app/modules/product/product.services';

const getUserMeta = async (
  userId: string,
  query: TMetaLocationQuery
): Promise<TUserMetaPayload> => {
  const actor = { userId };
  const origin = await resolveUserOrigin(userId, query);

  const [
    user,
    banners,
    lastOrder,
    nearbyBrands,
    recentlyViewed,
    trending,
    aiRecommended,
    unreadNotification,
  ] = await Promise.all([
    User.findById(userId)
      .select('name deliveryAddress')
      .lean(),
    getHomeBanners(),
    getLastPaidActiveOrder(userId),
    getNearbyBrands(origin),
    ProductService.getRecentlyViewedProducts(actor, { page: 1, limit: 10 }),
    ProductService.getTrendingProducts({ page: 1, limit: 2 }, userId),
    ProductService.getAiRecommendedProducts(actor, { page: 1, limit: 2 }),
    getRiderUnreadNotificationCount(userId),
  ]);

  if (!user) {
    throw new ApiError(HttpStatusCode.NotFound, 'User not found');
  }

  return {
    profile: {
      name: user.name,
      deliveryAddress: user.deliveryAddress ?? null,
    },
    unreadNotification,
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

const getRiderMeta = async (
  traceId: string,
  riderId: string
): Promise<TRiderMetaPayload> => {
  const rider = await User.findById(riderId).select('name').lean();
  if (!rider) {
    throw new ApiError(HttpStatusCode.NotFound, 'Rider not found', traceId);
  }

  const [unreadNotification, jobStats, assignJobs] = await Promise.all([
    getRiderUnreadNotificationCount(riderId),
    getRiderJobStats(riderId),
    getRiderAssignJobs(riderId),
  ]);

  return {
    profile: { name: rider.name },
    unreadNotification,
    todayEarning: jobStats.todayEarning,
    weeklyEarning: jobStats.weeklyEarning,
    deliveries: jobStats.deliveries,
    assignJobs,
  };
};

const getAdminMeta = async (
  query: TAdminMetaQuery
): Promise<TAdminMetaPayload> => {
  const [stats, userGrowth, joinedUsers, recentOrders] = await Promise.all([
    getAdminDashboardStats(),
    getAdminUserGrowth(query.year),
    getAdminJoinedUsers(query.role),
    getAdminRecentOrders(),
  ]);

  return { stats, userGrowth, joinedUsers, recentOrders };
};

const getVendorMeta = async (
  vendorId: string,
  query: TVendorMetaQuery
): Promise<TVendorMetaPayload> => {
  const earningYear = query.ordersEarninigFilter ?? query.year;
  const countYear = query.ordersCountFilter ?? query.year;

  const [stats, orderEarningAnalysis, orderCountAnalysis] = await Promise.all([
    getVendorDashboardStats(vendorId),
    getVendorOrderEarningAnalysis(vendorId, earningYear),
    getVendorOrderCountAnalysis(vendorId, countYear),
  ]);

  return { stats, orderEarningAnalysis, orderCountAnalysis };
};

export const MetaService = {
  getUserMeta,
  getGuestMeta,
  getRiderMeta,
  getAdminMeta,
  getVendorMeta,
};
