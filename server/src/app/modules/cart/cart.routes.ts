import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { CartController } from '@/app/modules/cart/cart.controllers';
import { CartValidation } from '@/app/modules/cart/cart.validation';
import { AUTHENTICATED_ROLES } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/')
  .get(auth(...AUTHENTICATED_ROLES), CartController.getCart);

router
  .route('/add')
  .post(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(CartValidation.addCartItemValidationSchema),
    CartController.add
  );

router
  .route('/update')
  .put(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(CartValidation.updateCartItemValidationSchema),
    CartController.update
  );

router
  .route('/remove')
  .delete(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(CartValidation.removeCartItemValidationSchema),
    CartController.remove
  );

router
  .route('/clear')
  .delete(auth(...AUTHENTICATED_ROLES), CartController.clear);

export const CartRoutes = router;
