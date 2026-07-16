import { Model, Types } from 'mongoose';

export type TCartColor = {
  code: string;
  name: string;
};

export type TCartItem = {
  productId: Types.ObjectId;
  size: string;
  color: TCartColor;
  quantity: number;
};

export interface ICart {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  items: TCartItem[];
  createdAt: Date;
  updatedAt: Date;
}

export type ICartModel = Model<ICart, Record<string, unknown>>;
