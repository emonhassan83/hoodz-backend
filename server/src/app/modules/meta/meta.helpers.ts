import {
  BANNER_STATUS,
  SECTION_TYPE,
} from '@/app/modules/banner/banner.constant';
import { ISectionType } from '@/app/modules/banner/banner.interface';
import {
  fillMonthSeries,
  parseYear,
  yearRange,
} from '@/app/modules/analysis/analysis.helpers';
import { Banner } from '@/app/modules/banner/banner.model';
import { Cart } from '@/app/modules/cart/cart.model';
import { Items } from '@/app/modules/items/items.model';
import mongoose from 'mongoose';

import { JOB_ASSIGNMENT_TYPE } from '@/app/constant';
import { JOB_STATUS } from '@/app/modules/job/job.constant';
import { Job } from '@/app/modules/job/job.model';
import {
  TAdminJoinedUser,
  TAdminMetaStats,
  TAdminRecentOrder,
  TAdminUserGrowthItem,
  TVendorOrderCountAnalysisItem,
  TVendorOrderEarningAnalysisItem,
  TMetaBannerItem,
  TMetaBrandItem,
  TMetaLastOrder,
  TMetaLocationQuery,
  TMetaOrigin,
  TMetaProductCard,
  TRiderAssignJob,
} from '@/app/modules/meta/meta.types';
import { Notification } from '@/app/modules/notification/notification.model';
import {
  ORDER_STATUS,
  PAYMENT_STATUS,
} from '@/app/modules/orders/orders.constant';
import { Orders } from '@/app/modules/orders/orders.model';
import { Payment } from '@/app/modules/payment/payment.model';
import {
  calculateDistanceKm,
  getGoogleDistanceMatrix,
} from '@/app/modules/user/user.helpers';
import { TGoogleDistanceElement } from '@/app/modules/user/user.types';
import { USER_ROLE, USER_STATUS } from '@/app/modules/user/user.constant';
import { User } from '@/app/modules/user/user.model';

const NEARBY_BRAND_LIMIT = 6;
const NEARBY_RADIUS_KM = 10;
const GOOGLE_DESTINATION_LIMIT = 25;

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const parseOriginFromQuery = (
  query: TMetaLocationQuery
): TMetaOrigin | null => {
  const latitude = toNumber(query.latitude ?? query.lat);
  const longitude = toNumber(query.longitude ?? query.lng ?? query.lang);
  if (latitude === undefined || longitude === undefined) return null;
  return { latitude, longitude };
};

export const resolveUserOrigin = async (
  userId: string,
  query: TMetaLocationQuery
): Promise<TMetaOrigin | null> => {
  const fromQuery = parseOriginFromQuery(query);
  if (fromQuery) return fromQuery;

  const user = await User.findById(userId)
    .select('deliveryAddress location')
    .lean();
  const coordinates =
    user?.deliveryAddress?.location?.coordinates?.some((coordinate) => coordinate !== 0)
      ? user.deliveryAddress.location.coordinates
      : user?.location?.coordinates;

  if (!coordinates || coordinates.every((coordinate) => coordinate === 0)) {
    return null;
  }

  return { longitude: coordinates[0], latitude: coordinates[1] };
};

export const getSectionBanners = async (section: ISectionType) => {
  const banners = await Banner.find({
    section,
    status: BANNER_STATUS.active,
  })
    .select('banner reference -_id')
    .sort({ createdAt: -1 })
    .lean();

  return banners.map(
    (item): TMetaBannerItem => ({
      banner: item.banner,
      reference: item.reference ?? null,
    })
  );
};

export const getHomeBanners = async () => {
  const [firstSectionBanner, secondSectionBanner] = await Promise.all([
    getSectionBanners(SECTION_TYPE.first),
    getSectionBanners(SECTION_TYPE.second),
  ]);
  return { firstSectionBanner, secondSectionBanner };
};

export const getNearbyBrands = async (
  origin: TMetaOrigin | null
): Promise<TMetaBrandItem[]> => {
  if (!origin) return [];

  const vendors = await User.find({
    role: USER_ROLE.vendor,
    status: USER_STATUS.active,
    isDeleted: false,
    'location.coordinates.0': { $ne: 0 },
    'location.coordinates.1': { $ne: 0 },
  })
    .select('name profileAvatar location')
    .lean();

  const candidates = vendors
    .map((vendor) => {
      const [longitude, latitude] = vendor.location?.coordinates ?? [0, 0];
      return {
        _id: vendor._id,
        name: vendor.name,
        profileAvatar: vendor.profileAvatar ?? null,
        coordinate: { latitude, longitude },
        straightKm: calculateDistanceKm(origin, { latitude, longitude }),
      };
    })
    .filter((vendor) => vendor.straightKm <= NEARBY_RADIUS_KM);

  if (candidates.length === 0) return [];

  const googleElements: TGoogleDistanceElement[] = [];
  try {
    for (let i = 0; i < candidates.length; i += GOOGLE_DESTINATION_LIMIT) {
      const chunk = candidates.slice(i, i + GOOGLE_DESTINATION_LIMIT);
      const elements = await getGoogleDistanceMatrix(
        origin,
        chunk.map((vendor) => vendor.coordinate)
      );
      googleElements.push(...elements);
    }
  } catch (error) {
    console.warn(
      '[Nearby Brands] Google Maps distance lookup failed:',
      error instanceof Error ? error.message : error
    );
    return [];
  }

  return candidates
    .map((vendor, index) => {
      const element = googleElements[index];
      const distanceKm =
        element?.status === 'OK' && element.distance?.value !== undefined
          ? element.distance.value / 1000
          : Number.POSITIVE_INFINITY;

      return { ...vendor, distanceKm };
    })
    .filter((vendor) => vendor.distanceKm <= NEARBY_RADIUS_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, NEARBY_BRAND_LIMIT)
    .map(({ _id, name, profileAvatar }) => ({ _id, name, profileAvatar }));
};

export const getLastPaidActiveOrder = async (
  userId: string
): Promise<TMetaLastOrder | null> => {
  const order = await Orders.findOne({
    user: userId,
    isDeleted: false,
    paymentStatus: PAYMENT_STATUS.paid,
    status: { $ne: ORDER_STATUS.cancelled },
  })
    .select('_id id totalAmount status createdAt')
    .sort({ createdAt: -1 })
    .lean();

  if (!order) return null;

  const items = await Items.find({ order: order._id })
    .populate([{ path: 'product', select: 'title banner price discountPrice' }])
    .select('-__v')
    .lean();

  return {
    _id: order._id,
    id: order.id,
    items,
    amount: order.totalAmount,
    status: order.status,
    createdAt: order.createdAt,
  };
};

export const toHomeProductCards = (
  products: Array<Record<string, any>> = []
): TMetaProductCard[] =>
  products.map((product) => ({
    _id: product._id,
    title: product.title,
    collectionType: product.collectionType,
    banner: product.banner ?? null,
    price: product.price ?? 0,
    discountPrice: product.discountPrice ?? product.price ?? 0,
    avgRating: product.avgRating ?? 0,
    ratingCount: product.ratingCount ?? 0,
    isWishlisted: Boolean(product.isWishlisted),
    inStock: Boolean(product.inStock),
  }));

const toMoney = (value: number) => Number(value.toFixed(2));

const startOfUtcDay = (date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const startOfUtcIsoWeek = (date = new Date()) => {
  const dayStart = startOfUtcDay(date);
  const daysFromMonday = (dayStart.getUTCDay() + 6) % 7;
  dayStart.setUTCDate(dayStart.getUTCDate() - daysFromMonday);
  return dayStart;
};

const jobPointToOrigin = (coordinates?: number[]) => {
  const [longitude, latitude] = coordinates ?? [0, 0];
  return { longitude, latitude };
};

export const getRiderUnreadNotificationCount = (riderId: string) =>
  Notification.countDocuments({ receiver: riderId, read: false });

export const getRiderJobStats = async (riderId: string) => {
  const todayStart = startOfUtcDay();
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
  const weekStart = startOfUtcIsoWeek();
  const rider = new mongoose.Types.ObjectId(riderId);

  const [deliveries, todayRows, weekRows] = await Promise.all([
    Job.countDocuments({ rider: riderId, status: JOB_STATUS.delivered }),
    Job.aggregate<{ total: number }>([
      {
        $match: {
          rider,
          status: JOB_STATUS.delivered,
          completedAt: { $gte: todayStart, $lt: tomorrowStart },
        },
      },
      { $group: { _id: null, total: { $sum: '$earning' } } },
    ]),
    Job.aggregate<{ total: number }>([
      {
        $match: {
          rider,
          status: JOB_STATUS.delivered,
          completedAt: { $gte: weekStart },
        },
      },
      { $group: { _id: null, total: { $sum: '$earning' } } },
    ]),
  ]);

  return {
    deliveries,
    todayEarning: toMoney(todayRows[0]?.total ?? 0),
    weeklyEarning: toMoney(weekRows[0]?.total ?? 0),
  };
};

export const getRiderAssignJobs = async (
  riderId: string
): Promise<TRiderAssignJob[]> => {
  const jobs = await Job.find({
    rider: riderId,
    status: JOB_STATUS.assigned,
    assignmentType: JOB_ASSIGNMENT_TYPE.agent,
  })
    .populate([{ path: 'order', select: 'totalAmount' }])
    .select('id earning pickup destination status collectedMoney')
    .sort({ createdAt: -1 })
    .lean();

  return jobs.map((job) => {
    const order = job.order as { totalAmount?: number } | null;
    const distanceKm = toMoney(
      calculateDistanceKm(
        jobPointToOrigin(job.pickup?.coordinates),
        jobPointToOrigin(job.destination?.coordinates)
      )
    );

    return {
      _id: job._id,
      id: job.id,
      earning: toMoney(job.earning ?? 0),
      distanceKm,
      pickup: { address: job.pickup?.address ?? '' },
      destination: { address: job.destination?.address ?? '' },
      amount: toMoney(order?.totalAmount ?? job.collectedMoney ?? 0),
      status: job.status,
    };
  });
};

const activeOrderMatch = {
  isDeleted: false,
  status: { $ne: ORDER_STATUS.cancelled },
  paymentStatus: { $ne: PAYMENT_STATUS.refunded },
};

export const getAdminDashboardStats = async (): Promise<TAdminMetaStats> => {
  const [
    orders,
    averageRows,
    cartRows,
    initiateCheckoutCount,
    unreadOrders,
    missedOrder,
    salesRows,
  ] = await Promise.all([
    Orders.countDocuments(activeOrderMatch),
    Orders.aggregate<{ avg: number }>([
      { $match: activeOrderMatch },
      { $group: { _id: null, avg: { $avg: '$totalAmount' } } },
    ]),
    Cart.aggregate<{ total: number }>([
      { $unwind: { path: '$items', preserveNullAndEmptyArrays: false } },
      { $group: { _id: null, total: { $sum: '$items.quantity' } } },
    ]),
    Orders.countDocuments({ isDeleted: false }),
    Orders.countDocuments({
      isDeleted: false,
      status: ORDER_STATUS.pending,
    }),
    Orders.countDocuments({
      isDeleted: false,
      status: ORDER_STATUS.cancelled,
    }),
    Orders.aggregate<{ total: number }>([
      { $match: { isDeleted: false, paymentStatus: PAYMENT_STATUS.paid } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]),
  ]);

  const totalSales = toMoney(salesRows[0]?.total ?? 0);

  return {
    orders,
    ordersAveragePrice: toMoney(averageRows[0]?.avg ?? 0),
    addToCartCount: cartRows[0]?.total ?? 0,
    initiateCheckoutCount,
    unreadOrders,
    missedOrder,
    totalSales,
    netRevenue: totalSales,
  };
};

export const getAdminUserGrowth = async (
  yearValue: unknown
): Promise<TAdminUserGrowthItem[]> => {
  const year = parseYear(yearValue);
  const rows = await User.aggregate<{
    month: number;
    role: string;
    count: number;
  }>([
    {
      $match: {
        isDeleted: false,
        createdAt: yearRange(year),
        role: {
          $in: [
            USER_ROLE.user,
            USER_ROLE.vendor,
            USER_ROLE.rider,
            USER_ROLE.agent,
          ],
        },
      },
    },
    {
      $group: {
        _id: { month: { $month: '$createdAt' }, role: '$role' },
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        month: '$_id.month',
        role: '$_id.role',
        count: 1,
      },
    },
  ]);

  const byMonth = new Map<
    number,
    { user: number; rider: number; vendor: number; agent: number }
  >();
  rows.forEach((row) => {
    const current = byMonth.get(row.month) ?? {
      user: 0,
      rider: 0,
      vendor: 0,
      agent: 0,
    };
    if (row.role === USER_ROLE.user) current.user += row.count;
    if (row.role === USER_ROLE.rider) current.rider += row.count;
    if (row.role === USER_ROLE.vendor) current.vendor += row.count;
    if (row.role === USER_ROLE.agent) current.agent += row.count;
    byMonth.set(row.month, current);
  });

  return fillMonthSeries(
    [...byMonth.entries()].map(([month, counts]) => ({ month, ...counts })),
    { user: 0, rider: 0, vendor: 0, agent: 0 }
  );
};

export const getAdminJoinedUsers = async (
  roleValue: unknown
): Promise<TAdminJoinedUser[]> => {
  const role =
    roleValue === USER_ROLE.vendor ||
    roleValue === USER_ROLE.rider ||
    roleValue === USER_ROLE.user
      ? roleValue
      : USER_ROLE.user;

  const users = await User.find({ role, isDeleted: false })
    .select('name email profileAvatar')
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  return users.map((user) => ({
    _id: user._id,
    name: user.name,
    email: user.email,
    profileAvatar: user.profileAvatar ?? null,
  }));
};

export const getAdminRecentOrders = async (): Promise<TAdminRecentOrder[]> => {
  const orders = await Orders.find({ isDeleted: false })
    .select('id totalAmount status')
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  if (orders.length === 0) return [];

  const orderIds = orders.map((order) => order._id);
  const [items, payments] = await Promise.all([
    Items.find({ order: { $in: orderIds } })
      .populate([{ path: 'product', select: 'title banner' }])
      .sort({ createdAt: 1 })
      .lean(),
    Payment.find({ order: { $in: orderIds } })
      .select('order paymentMethod createdAt')
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  const itemByOrder = new Map<string, (typeof items)[number]>();
  items.forEach((item) => {
    const orderId = item.order.toString();
    if (!itemByOrder.has(orderId)) itemByOrder.set(orderId, item);
  });

  const paymentByOrder = new Map<string, string>();
  payments.forEach((payment) => {
    const orderId = payment.order.toString();
    if (!paymentByOrder.has(orderId)) {
      paymentByOrder.set(orderId, payment.paymentMethod);
    }
  });

  return orders.map((order) => {
    const item = itemByOrder.get(order._id.toString());
    const product = item?.product as
      | { title?: string; banner?: string | null }
      | undefined;

    return {
      _id: order._id,
      id: order.id,
      items: {
        product: {
          title: product?.title ?? '',
          banner: product?.banner ?? null,
        },
      },
      amount: toMoney(order.totalAmount ?? 0),
      paymentMethod: paymentByOrder.get(order._id.toString()) ?? null,
      status: order.status,
    };
  });
};

const vendorActiveOrderMatch = (vendorId: mongoose.Types.ObjectId) => ({
  author: vendorId,
  ...activeOrderMatch,
});

export const getVendorDashboardStats = async (
  vendorId: string
): Promise<TAdminMetaStats> => {
  const vendor = new mongoose.Types.ObjectId(vendorId);
  const activeMatch = vendorActiveOrderMatch(vendor);

  const [
    orders,
    averageRows,
    cartRows,
    initiateCheckoutCount,
    unreadOrders,
    missedOrder,
    salesRows,
  ] = await Promise.all([
    Orders.countDocuments(activeMatch),
    Orders.aggregate<{ avg: number }>([
      { $match: activeMatch },
      { $group: { _id: null, avg: { $avg: '$totalAmount' } } },
    ]),
    Cart.aggregate<{ total: number }>([
      { $unwind: { path: '$items', preserveNullAndEmptyArrays: false } },
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: '$product' },
      { $match: { 'product.vendor': vendor } },
      { $group: { _id: null, total: { $sum: '$items.quantity' } } },
    ]),
    Orders.countDocuments({ author: vendor, isDeleted: false }),
    Orders.countDocuments({
      author: vendor,
      isDeleted: false,
      status: ORDER_STATUS.pending,
    }),
    Orders.countDocuments({
      author: vendor,
      isDeleted: false,
      status: ORDER_STATUS.cancelled,
    }),
    Orders.aggregate<{ total: number }>([
      {
        $match: {
          author: vendor,
          isDeleted: false,
          paymentStatus: PAYMENT_STATUS.paid,
        },
      },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]),
  ]);

  const totalSales = toMoney(salesRows[0]?.total ?? 0);

  return {
    orders,
    ordersAveragePrice: toMoney(averageRows[0]?.avg ?? 0),
    addToCartCount: cartRows[0]?.total ?? 0,
    initiateCheckoutCount,
    unreadOrders,
    missedOrder,
    totalSales,
    netRevenue: totalSales,
  };
};

export const getVendorOrderEarningAnalysis = async (
  vendorId: string,
  yearValue: unknown
): Promise<TVendorOrderEarningAnalysisItem[]> => {
  const year = parseYear(yearValue);
  const vendor = new mongoose.Types.ObjectId(vendorId);

  const rows = await Orders.aggregate<{ month: number; amount: number }>([
    {
      $match: {
        author: vendor,
        isDeleted: false,
        paymentStatus: PAYMENT_STATUS.paid,
        createdAt: yearRange(year),
      },
    },
    {
      $group: {
        _id: { $month: '$createdAt' },
        amount: { $sum: '$totalAmount' },
      },
    },
    { $project: { _id: 0, month: '$_id', amount: 1 } },
  ]);

  return fillMonthSeries(rows, { amount: 0 }).map((item) => ({
    month: item.month,
    amount: toMoney(item.amount),
  }));
};

export const getVendorOrderCountAnalysis = async (
  vendorId: string,
  yearValue: unknown
): Promise<TVendorOrderCountAnalysisItem[]> => {
  const year = parseYear(yearValue);
  const vendor = new mongoose.Types.ObjectId(vendorId);

  const rows = await Orders.aggregate<{ month: number; count: number }>([
    {
      $match: {
        author: vendor,
        isDeleted: false,
        status: { $ne: ORDER_STATUS.cancelled },
        paymentStatus: { $ne: PAYMENT_STATUS.refunded },
        createdAt: yearRange(year),
      },
    },
    {
      $group: {
        _id: { $month: '$createdAt' },
        count: { $sum: 1 },
      },
    },
    { $project: { _id: 0, month: '$_id', count: 1 } },
  ]);

  return fillMonthSeries(rows, { count: 0 });
};
