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
  banner: string;
  reference: string | null;
};

export type TMetaBrandItem = {
  _id: unknown;
  name: string;
  profileAvatar?: string | null;
};

export type TMetaProductCard = {
  _id: unknown;
  title: string;
  collectionType: string;
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

export type TUserMetaPayload = {
  firstSectionBanner: TMetaBannerItem[];
  lastOrder: TMetaLastOrder | null;
  nearbyBrands: TMetaBrandItem[];
  recentlyViwed: TMetaProductCard[];
  trandingProducts: TMetaProductCard[];
  secondSectionBanner: TMetaBannerItem[];
  aiRecommandedProducts: TMetaProductCard[];
};

export type TGuestMetaPayload = Omit<TUserMetaPayload, 'lastOrder'>;
