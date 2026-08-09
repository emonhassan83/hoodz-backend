import { Types } from 'mongoose';

export type TCartColor = {
  code: string;
  name: string;
};

export type TCartItem = {
  productId: Types.ObjectId;
  size?: string | null;
  color?: TCartColor | null;
  quantity: number;
};

export type TCartActor = {
  userId?: string;
  guestId?: string;
};

export type TCartItemIdentity = {
  productId: string;
  size?: string | null;
  color?: TCartColor | null;
};

export type TAddCartItemPayload = TCartItemIdentity & {
  quantity: number;
};

export type TUpdateCartItemPayload = TCartItemIdentity & {
  quantity: number;
};

export type TRemoveCartItemPayload = TCartItemIdentity;

export type TEnrichedCartItem = TCartItem & {
  product: {
    _id: Types.ObjectId;
    vendorId: Types.ObjectId;
    title: string;
    images: string[];
    inventoryType: string;
    price: number;
    discountPrice: number;
  };
  unitPrice: number;
  totalPrice: number;
};


