import { TProductColor } from '@/app/modules/product/product.types';

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
  discount?: number;
  tax?: number;
};

export type TUpdatePosOrderPayload = {
  discount: number;
  tax: number;
};

export type TPosOrderRequester = {
  userId: string;
  role: string;
};
