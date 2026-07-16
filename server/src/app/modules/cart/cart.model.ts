import { Schema, model } from 'mongoose';

import { ICart, ICartModel } from '@/app/modules/cart/cart.interface';

const cartColorSchema = new Schema(
  {
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const cartItemSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    size: {
      type: String,
      required: true,
      trim: true,
    },
    color: {
      type: cartColorSchema,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  { _id: false }
);

const cartSchema = new Schema<ICart, ICartModel>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    items: {
      type: [cartItemSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

cartSchema.index({ userId: 1, 'items.productId': 1, 'items.size': 1, 'items.color.code': 1 });

export const Cart = model<ICart, ICartModel>('Cart', cartSchema);
