import { Model, Types } from 'mongoose';

export interface IItems {
  _id: Types.ObjectId
  product: Types.ObjectId
  author: Types.ObjectId
  order: Types.ObjectId
  quantity: number
  price: number
  totalPrice: number
  size?: string | null
  color?: {
    code: string
    name: string
  } | null
  createdAt: Date
  updatedAt: Date
}

export type IItemsModel = Model<IItems, Record<string, unknown>>;


