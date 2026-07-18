import { Model, Types } from 'mongoose';

import { TCartItem } from '@/app/modules/cart/cart.types';

export interface ICart {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  items: TCartItem[];
  createdAt: Date;
  updatedAt: Date;
}

export type ICartModel = Model<ICart, Record<string, unknown>>;
