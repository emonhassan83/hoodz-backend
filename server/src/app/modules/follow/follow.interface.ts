import { Model, Types } from 'mongoose';

export interface IFollow {
  _id?: string;
  follower: Types.ObjectId;
  following: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type IFollowModel = Model<IFollow, Record<string, unknown>>;


