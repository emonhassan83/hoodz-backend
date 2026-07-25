import { Schema, model } from 'mongoose';

import {
  COLLECTION_TYPE,
  PRODUCT_INVENTORY_TYPE,
} from '@/app/modules/product/product.constant';
import {
  IProduct,
  IProductModel,
  IProductStockNotify,
  IProductStockNotifyModel,
} from '@/app/modules/product/product.interface';

const colorSchema = new Schema(
  {
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const variantSchema = new Schema(
  {
    size: { type: String, default: null, trim: true },
    color: { type: colorSchema, default: null },
    quantity: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

const seoSchema = new Schema(
  {
    metaTitle: {
      type: String,
      trim: true,
    },
    metaDescription: {
      type: String,
      trim: true,
    },
    metaKeywords: {
      type: [String],
      default: [],
    },
    ratingValue: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

const productSchema = new Schema<IProduct, IProductModel>(
  {
    vendorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
      index: true,
    },
    sku: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    inventoryType: {
      type: String,
      enum: Object.values(PRODUCT_INVENTORY_TYPE),
      required: true,
      default: PRODUCT_INVENTORY_TYPE.sizeColor,
      index: true,
    },
    collectionType: {
      type: String,
      enum: Object.values(COLLECTION_TYPE),
      required: true,
    },
    brand: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    images: { type: [String], required: true, default: [] },
    price: { type: Number, required: true, min: 0 },
    discount: { type: Number, required: true, min: 0, max: 100, default: 0 },
    discountPrice: { type: Number, required: true, min: 0, default: 0 },
    sizes: { type: [String], default: [] },
    colors: { type: [colorSchema], default: [] },
    stock: { type: Number, required: true, min: 0, default: 0 },
    avgRating: { type: Number, default: 0, min: 0 },
    ratingCount: { type: Number, default: 0, min: 0 },
    sold: { type: Number, default: 0, min: 0, index: true },
    variants: { type: [variantSchema], required: true, default: [] },
    seo: {
      type: seoSchema,
      default: () => ({ metaKeywords: [], ratingValue: 0 }),
    },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  {
    timestamps: true,
  }
);

productSchema.index({ vendorId: 1, isDeleted: 1, createdAt: -1 });
productSchema.index({ category: 1, isDeleted: 1 });
productSchema.index({
  avgRating: -1,
  ratingCount: -1,
  sold: -1,
  isDeleted: 1,
});

export const Product = model<IProduct, IProductModel>('Product', productSchema);

const productStockNotifySchema = new Schema<
  IProductStockNotify,
  IProductStockNotifyModel
>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    notifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

productStockNotifySchema.index({ user: 1, product: 1 }, { unique: true });
productStockNotifySchema.index({ product: 1, notifiedAt: 1 });

export const ProductStockNotify = model<
  IProductStockNotify,
  IProductStockNotifyModel
>('ProductStockNotify', productStockNotifySchema);

