import {
  COLLECTION_TYPE,
  PRODUCT_BRAND_TYPE,
  PRODUCT_INVENTORY_TYPE,
} from '@/app/modules/product/product.constant';

export type ICollectionType = keyof typeof COLLECTION_TYPE;

export type TProductInventoryType =
  (typeof PRODUCT_INVENTORY_TYPE)[keyof typeof PRODUCT_INVENTORY_TYPE];

export type TProductBrandType =
  (typeof PRODUCT_BRAND_TYPE)[keyof typeof PRODUCT_BRAND_TYPE];

export type TProductColor = {
  code: string;
  name: string;
};

export type TProductVariant = {
  _id?: import('mongoose').Types.ObjectId;
  size?: string | null;
  color?: TProductColor | null;
  quantity: number;
};

export type TProductSeo = {
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string[];
  ratingValue?: number;
};

export type TProductPayload = {
  category: string;
  sku: string;
  inventoryType: TProductInventoryType;
  collectionType: ICollectionType;
  brand: string;
  brandType?: TProductBrandType;
  title: string;
  description: string;
  banner?: string | null;
  images?: string[];
  price: number;
  discount?: number;
  stock?: number;
  variants?: TProductVariant[];
  seo?: TProductSeo;
};

export type TAdminProductPayload = TProductPayload & {
  vendor: string;
};

export type TProductVariantSummary = {
  sizes: string[];
  colors: TProductColor[];
  stock: number;
};

export type TProductRequester = {
  userId: string;
  role: string;
};

export type TProductListQuery = Record<string, unknown>;

export type TProductFilterQuery = {
  category?: string | string[];
  categories?: string | string[];
  categoryId?: string | string[];
  brand?: string | string[];
  brandType?: string | string[];
  vendor?: string | string[];
  vendorId?: string | string[];
  color?: string | string[];
  colors?: string | string[];
  size?: string | string[];
  sizes?: string | string[];
  collectionType?: string | string[];
  gender?: string | string[];
  minPrice?: string | number;
  maxPrice?: string | number;
  minimumPrice?: string | number;
  maximumPrice?: string | number;
  latitude?: string | number;
  longitude?: string | number;
  lat?: string | number;
  lng?: string | number;
  lang?: string | number;
  maxDistanceKm?: string | number;
  maxDistance?: string | number;
  maxDeliveryTimeMinutes?: string | number;
  maxDeliveryTime?: string | number;
  excludeStockOut?: string | boolean;
  stockFilter?: string;
};

export type TProductViewPayload = {
  productId: string;
};

export type TProductWithWishlist<T> = T & {
  isWishlisted: boolean;
};

export type TProductPaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPage: number;
};

export type TProductActor = {
  userId?: string;
  guestId?: string;
};

export type TProductListResponse = {
  meta: TProductPaginationMeta;
  data: Array<Record<string, any>>;
};

export type TProductDashboardStats = {
  overview: {
    allProducts: number;
    totalValue: number;
    lowStock: number;
    outOfStock: number;
  };
  analytics: {
    topCategories: { title: string; count: number }[];
    priceDistribution: { label: string; count: number }[];
    stockInsights: { label: string; count: number }[];
  };
};

export type TMyProductsResponse = {
  meta: TProductPaginationMeta;
  data: {
    stats: TProductDashboardStats;
    products: Array<Record<string, any>>;
  };
};


