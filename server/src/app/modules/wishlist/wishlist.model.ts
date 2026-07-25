import { Schema, model } from 'mongoose';

import {
  IWishlist,
  IWishlistModel,
} from '@/app/modules/wishlist/wishlist.interface';

const wishlistSchema = new Schema<IWishlist, IWishlistModel>(
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
  },
  { timestamps: true }
);

wishlistSchema.index({ user: 1, product: 1 }, { unique: true });

export const Wishlist = model<IWishlist, IWishlistModel>(
  'Wishlist',
  wishlistSchema
);

