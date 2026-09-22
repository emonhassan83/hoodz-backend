import { IUserDeliveryAddress } from '@/app/modules/user/user.interface';

export type TMetaLocationQuery = {
  lat?: unknown;
  lng?: unknown;
  lang?: unknown;
  latitude?: unknown;
  longitude?: unknown;
};

export type TMetaOrigin = {
  latitude: number;
  longitude: number;
};

export type TMetaBannerItem = {
  _id: unknown;
  banner: string;
  bannerArabic?: string | null;
  reference: string | null;
  type: string;
};

export type TMetaBrandItem = {
  _id: unknown;
  name: string;
  profileAvatar?: string | null;
};

export type TMetaProductCard = {
  _id: unknown;
  title: string;
  titleArabic?: string | null;
  collectionType: string;
  banner: string | null;
  price: number;
  discountPrice: number;
  avgRating: number;
  ratingCount: number;
  isWishlisted: boolean;
  inStock: boolean;
};

export type TMetaLastOrder = {
  _id: unknown;
  id: string;
  items: unknown[];
  amount: number;
  status: string;
  createdAt: Date;
};

export type TUserMetaProfile = {
  name: string;
  deliveryAddress: IUserDeliveryAddress | null;
};

export type TUserMetaPayload = {
  profile: TUserMetaProfile;
  unreadNotification: number;
  cartItems: number;
  firstSectionBanner: TMetaBannerItem[];
  lastOrder: TMetaLastOrder | null;
  nearbyBrands: TMetaBrandItem[];
  recentlyViwed: TMetaProductCard[];
  trandingProducts: TMetaProductCard[];
  secondSectionBanner: TMetaBannerItem[];
  aiRecommandedProducts: TMetaProductCard[];
};

export type TGuestMetaPayload = Omit<
  TUserMetaPayload,
  'lastOrder' | 'profile' | 'unreadNotification' | 'cartItems'
>;

export type TRiderAssignJob = {
  _id: unknown;
  id: string;
  earning: number;
  distanceKm: number;
  pickup: { address: string };
  destination: { address: string };
  amount: number;
  status: string;
};

export type TRiderMetaPayload = {
  profile: { name: string };
  unreadNotification: number;
  todayEarning: number;
  weeklyEarning: number;
  deliveries: number;
  assignJobs: TRiderAssignJob[];
};

export type TAdminMetaQuery = {
  year?: unknown;
  role?: unknown;
};

export type TAdminMetaStats = {
  orders: number;
  ordersAveragePrice: number;
  addToCartCount: number;
  initiateCheckoutCount: number;
  unreadOrders: number;
  missedOrder: number;
  totalSales: number;
  netRevenue: number;
};

export type TAdminUserGrowthItem = {
  month: string;
  user: number;
  rider: number;
  vendor: number;
  agent: number;
};

export type TAdminJoinedUser = {
  _id: unknown;
  name: string;
  email: string;
  profileAvatar: string | null;
};

export type TAdminRecentOrder = {
  _id: unknown;
  id: string;
  items: { product: { title: string; banner: string | null } };
  amount: number;
  paymentMethod: string | null;
  status: string;
};

export type TAdminMetaPayload = {
  stats: TAdminMetaStats;
  userGrowth: TAdminUserGrowthItem[];
  joinedUsers: TAdminJoinedUser[];
  recentOrders: TAdminRecentOrder[];
};

export type TVendorOrderEarningAnalysisItem = {
  month: string;
  amount: number;
};

export type TVendorOrderCountAnalysisItem = {
  month: string;
  count: number;
};

export type TVendorMetaQuery = {
  ordersEarninigFilter?: unknown;
  ordersCountFilter?: unknown;
  year?: unknown;
};

export type TVendorMetaPayload = {
  stats: TAdminMetaStats;
  orderEarningAnalysis: TVendorOrderEarningAnalysisItem[];
  orderCountAnalysis: TVendorOrderCountAnalysisItem[];
};
