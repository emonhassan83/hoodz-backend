import { Schema, model } from 'mongoose';

import { COLLECTION_TYPE } from '@/app/modules/product/product.constant';
import { IProduct, IProductModel } from '@/app/modules/product/product.interface';

const colorSchema = new Schema(
  {
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const variantSchema = new Schema(
  {
    size: { type: String, required: true, trim: true },
    color: { type: colorSchema, required: true },
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

export const Product = model<IProduct, IProductModel>('Product', productSchema);
