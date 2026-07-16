import { Model, Types } from 'mongoose';

import { ICollectionType } from '@/app/modules/product/product.constant';

export type TProductColor = {
  code: string;
  name: string;
};

export type TProductVariant = {
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

export interface IProduct {
  _id: Types.ObjectId;
  vendorId: Types.ObjectId;
  category: Types.ObjectId;
  sku: string;
  collectionType: ICollectionType;
  brand: string;
  title: string;
  description: string;
  images: string[];
  price: number;
  discount: number;
  discountPrice: number;
  sizes: string[];
  colors: TProductColor[];
  stock: number;
  variants: TProductVariant[];
  seo?: TProductSeo;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type IProductModel = Model<IProduct, Record<string, unknown>>;
