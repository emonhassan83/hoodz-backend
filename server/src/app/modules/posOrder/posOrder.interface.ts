import { Model, Types } from 'mongoose';

import { TPosOrderStatus } from '@/app/modules/posOrder/posOrder.types';
import { TProductColor } from '@/app/modules/product/product.types';

export interface IPosOrderItem {
  product: Types.ObjectId;
  variant?: {
    size?: string | null;
    color?: TProductColor | null;
  };
  quantity: number;
}

export interface IPosOrder {
  _id: Types.ObjectId;
  items: IPosOrderItem[];
  subTotal: number;
  discount: number;
  tax: number;
  totalCost: number;
  soldBy: Types.ObjectId;
  shop: Types.ObjectId;
  status: TPosOrderStatus;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type IPosOrderModel = Model<IPosOrder, Record<string, unknown>>;
