import { Model, Types } from 'mongoose';

export interface ICampain {
  _id: Types.ObjectId;
  title: string;
  products: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

export type ICampainModel = Model<ICampain, Record<string, unknown>>;
