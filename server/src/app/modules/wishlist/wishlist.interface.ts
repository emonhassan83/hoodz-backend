import { Model, Types } from 'mongoose';

import { WISHLIST_MODEL_TYPE } from '@/app/modules/wishlist/wishlist.constant';

export type TWishlistModelType =
  (typeof WISHLIST_MODEL_TYPE)[keyof typeof WISHLIST_MODEL_TYPE];

export interface IWishlist {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  modelType: TWishlistModelType;
  reference: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type IWishlistModel = Model<IWishlist, Record<string, unknown>>;
