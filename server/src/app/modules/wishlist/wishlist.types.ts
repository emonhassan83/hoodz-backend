import { TWishlistModelType } from '@/app/modules/wishlist/wishlist.interface';

export type TWishlistTogglePayload = {
  referenceId: string;
  modelType?: TWishlistModelType;
};
