import { Schema, model } from 'mongoose';

import { WISHLIST_MODEL_TYPE } from '@/app/modules/wishlist/wishlist.constant';
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
    modelType: {
      type: String,
      enum: Object.values(WISHLIST_MODEL_TYPE),
      default: WISHLIST_MODEL_TYPE.product,
      index: true,
    },
    reference: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

wishlistSchema.index({ user: 1, modelType: 1, reference: 1 }, { unique: true });

export const Wishlist = model<IWishlist, IWishlistModel>(
  'Wishlist',
  wishlistSchema
);
