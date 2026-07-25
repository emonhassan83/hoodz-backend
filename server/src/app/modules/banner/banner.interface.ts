import { Model, Types } from 'mongoose';

export interface IBanner {
  _id: Types.ObjectId;
  banner: string;
  reference: string;
  createdAt: Date;
  updatedAt: Date;
}

export type IBannerModel = Model<IBanner, Record<string, unknown>>;

