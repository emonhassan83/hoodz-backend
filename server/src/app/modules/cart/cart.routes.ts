import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { CartController } from '@/app/modules/cart/cart.controllers';
import { CartValidation } from '@/app/modules/cart/cart.validation';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/')
  .get(auth(USER_ROLE.user), CartController.getCart);

router
  .route('/add')
  .post(
    auth(USER_ROLE.user),
    validateRequest(CartValidation.addCartItemValidationSchema),
    CartController.add
  );

router
  .route('/update')
  .put(
    auth(USER_ROLE.user),
    validateRequest(CartValidation.updateCartItemValidationSchema),
    CartController.update
  );

router
  .route('/remove')
  .delete(
    auth(USER_ROLE.user),
    validateRequest(CartValidation.removeCartItemValidationSchema),
    CartController.remove
  );

router
  .route('/clear')
  .delete(auth(USER_ROLE.user), CartController.clear);

export const CartRoutes = router;
