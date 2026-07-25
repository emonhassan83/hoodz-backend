import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import { WishlistController } from '@/app/modules/wishlist/wishlist.controllers';
import { WishlistValidation } from '@/app/modules/wishlist/wishlist.validation';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/')
  .get(auth(USER_ROLE.user), WishlistController.getAll);

router
  .route('/toggle/:productId')
  .post(
    auth(USER_ROLE.user),

    validateRequest(WishlistValidation.toggleWishlistValidationSchema),
    WishlistController.toggle
  );

export const WishlistRoutes = router;

