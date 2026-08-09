import { Model, Types } from 'mongoose';

export interface IWishlist {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  product: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type IWishlistModel = Model<IWishlist, Record<string, unknown>>;


