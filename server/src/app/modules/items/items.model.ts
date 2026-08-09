import { Schema, model } from 'mongoose';

import { IItems, IItemsModel } from './items.interface';

const itemColorSchema = new Schema(
  {
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const itemsSchema = new Schema<IItems, IItemsModel>(
   {
    order: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: [true, 'Order id is required'],
    },
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product id is required'],
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
    },
    totalPrice: {
      type: Number,
      required: [true, 'Total Price is required'],
    },
    size: {
      type: String,
      default: null,
    },
    color: {
      type: itemColorSchema,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

itemsSchema.index({ order: 1, author: 1 });
itemsSchema.index({ product: 1 });

export const Items = model<IItems, IItemsModel>('Items', itemsSchema);


