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
    vendor: Types.ObjectId;
    title: string;
    banner: string | null;
    inventoryType: string;
    price: number;
    discount: number;
    discountPrice: number;
    stock: number;
    colors: TCartColor[];
    sizes: string[];
    isDiscounted?: boolean;
    variants: Array<{
      _id?: Types.ObjectId;
      size?: string | null;
      color?: TCartColor | null;
      quantity: number;
    }>;
  };
  unitPrice: number;
  totalPrice: number;
};

export type TCartRecommendedProduct = {
  _id: Types.ObjectId;
  category: {
    _id: Types.ObjectId;
    title: string;
  } | null;
  title: string;
  collectionType: string;
  banner: string | null;
  price: number;
  discount: number;
  discountPrice: number;
  avgRating: number;
  ratingCount: number;
  inStock: boolean;
};

