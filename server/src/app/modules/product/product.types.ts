import { COLLECTION_TYPE } from '@/app/modules/product/product.constant';

export type ICollectionType = keyof typeof COLLECTION_TYPE;

export type TProductColor = {
  code: string;
  name: string;
};

export type TProductVariant = {
  _id?: import('mongoose').Types.ObjectId;
  size: string;
  color: TProductColor;
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
  collectionType: ICollectionType;
  brand: string;
  title: string;
  description: string;
  images: string[];
  price: number;
  discount?: number;
  variants: TProductVariant[];
  seo?: TProductSeo;
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
  category?: string;
  brand?: string;
  color?: string;
  size?: string;
  collectionType?: string;
  gender?: string;
  minPrice?: string | number;
  maxPrice?: string | number;
  minimumPrice?: string | number;
  maximumPrice?: string | number;
  latitude?: string | number;
  longitude?: string | number;
  maxDistanceKm?: string | number;
  maxDistance?: string | number;
  maxDeliveryTimeMinutes?: string | number;
  maxDeliveryTime?: string | number;
};

export type TProductViewPayload = {
  productId: string;
};

export type TProductWithWishlist<T> = T & {
  isWishlisted: boolean;
};
