import {
  BANNER_STATUS,
  SECTION_TYPE,
} from '@/app/modules/banner/banner.constant';
import { ISectionType } from '@/app/modules/banner/banner.interface';
import { Banner } from '@/app/modules/banner/banner.model';
import { Items } from '@/app/modules/items/items.model';
import {
  TMetaBannerItem,
  TMetaBrandItem,
  TMetaLastOrder,
  TMetaLocationQuery,
  TMetaOrigin,
  TMetaProductCard,
} from '@/app/modules/meta/meta.types';
import {
  ORDER_STATUS,
  PAYMENT_STATUS,
} from '@/app/modules/orders/orders.constant';
import { Orders } from '@/app/modules/orders/orders.model';
import { calculateDistanceKm } from '@/app/modules/user/user.helpers';
import { USER_ROLE, USER_STATUS } from '@/app/modules/user/user.constant';
import { User } from '@/app/modules/user/user.model';

const NEARBY_BRAND_LIMIT = 6;
const NEARBY_RADIUS_KM = 50;

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
    .select('deliveryLocation location')
    .lean();
  const coordinates =
    user?.deliveryLocation?.coordinates?.some((coordinate) => coordinate !== 0)
      ? user.deliveryLocation.coordinates
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

  return vendors
    .map((vendor) => {
      const [longitude, latitude] = vendor.location?.coordinates ?? [0, 0];
      return {
        _id: vendor._id,
        name: vendor.name,
        profileAvatar: vendor.profileAvatar ?? null,
        distanceKm: calculateDistanceKm(origin, { latitude, longitude }),
      };
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
    .populate([{ path: 'product', select: 'title images price discountPrice' }])
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
    price: product.price ?? 0,
    discountPrice: product.discountPrice ?? product.price ?? 0,
    avgRating: product.avgRating ?? 0,
    ratingCount: product.ratingCount ?? 0,
    isWishlisted: Boolean(product.isWishlisted),
    inStock: Boolean(product.inStock),
  }));
