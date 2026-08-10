import { POS_ORDER_STATUS } from '@/app/modules/posOrder/posOrder.constant';
import { TProductColor } from '@/app/modules/product/product.types';

export type TPosOrderStatus =
  (typeof POS_ORDER_STATUS)[keyof typeof POS_ORDER_STATUS];

export type TPosOrderItemPayload = {
  product: string;
  variant?: {
    size?: string | null;
    color?: TProductColor | null;
  };
  quantity: number;
};

export type TCreatePosOrderPayload = {
  items: TPosOrderItemPayload[];
  subTotal: number;
  discount?: number;
  tax?: number;
  totalCost: number;
};

export type TUpdatePosOrderPayload = Partial<
  Pick<TCreatePosOrderPayload, 'subTotal' | 'discount' | 'tax' | 'totalCost'>
> & {
  status?: TPosOrderStatus;
};

export type TPosOrderRequester = {
  userId: string;
  role: string;
};
