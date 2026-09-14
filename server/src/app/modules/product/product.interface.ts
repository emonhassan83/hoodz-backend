import { Model, Types } from 'mongoose';

import {
  ICollectionType,
  TProductBrandType,
  TProductInventoryType,
  TProductColor,
  TProductSeo,
  TProductVariant,
} from '@/app/modules/product/product.types';

export interface IProduct {
  _id: Types.ObjectId;
  vendor: Types.ObjectId;
  category: Types.ObjectId;
  sku: string;
  inventoryType: TProductInventoryType;
  collectionType: ICollectionType;
  brand: string;
  brandType: TProductBrandType;
  title: string;
  titleArabic?: string | null;
  description: string;
  descriptionArabic?: string | null;
  banner?: string | null;
  images: string[];
  price: number;
  discount: number;
  discountPrice: number;
  sizes: string[];
  colors: TProductColor[];
  stock: number;
  avgRating: number;
  ratingCount: number;
  sold: number;
  variants: TProductVariant[];
  seo?: TProductSeo;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type IProductModel = Model<IProduct, Record<string, unknown>>;

export interface IProductStockNotify {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  product: Types.ObjectId;
  notifiedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type IProductStockNotifyModel = Model<
  IProductStockNotify,
  Record<string, unknown>
>;


