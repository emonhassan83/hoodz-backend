import { Model, Types } from 'mongoose';

export interface IItems {
  product: Types.ObjectId
  author: Types.ObjectId
  order: Types.ObjectId
  quantity: number
  price: number
  totalPrice: number
  size: string
  color: string
}

export type IItemsModel = Model<IItems, Record<string, unknown>>;
