import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { AUTHENTICATED_ROLES } from '@/app/modules/user/user.constant';
import { WishlistController } from '@/app/modules/wishlist/wishlist.controllers';
import { WishlistValidation } from '@/app/modules/wishlist/wishlist.validation';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/')
  .get(auth(...AUTHENTICATED_ROLES), WishlistController.getAll);

router
  .route('/toggle/:productId')
  .post(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(WishlistValidation.toggleWishlistValidationSchema),
    WishlistController.toggle
  );

export const WishlistRoutes = router;
