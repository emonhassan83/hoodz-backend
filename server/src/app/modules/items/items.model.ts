import { Schema, model } from 'mongoose';

import { IItems, IItemsModel } from './items.interface';

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
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

export const Items = model<IItems, IItemsModel>('Items', itemsSchema);
