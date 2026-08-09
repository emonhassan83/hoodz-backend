import { Router } from 'express';

import { optionalAuth } from '@/app/middlewares/auth';
import { CartController } from '@/app/modules/cart/cart.controllers';
import { CartValidation } from '@/app/modules/cart/cart.validation';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/')
  .get(optionalAuth, CartController.getCart);

router
  .route('/add')
  .post(
    optionalAuth,
    validateRequest(CartValidation.addCartItemValidationSchema),
    CartController.add
  );

router
  .route('/update')
  .put(
    optionalAuth,
    validateRequest(CartValidation.updateCartItemValidationSchema),
    CartController.update
  );

router
  .route('/remove')
  .delete(
    optionalAuth,
    validateRequest(CartValidation.removeCartItemValidationSchema),
    CartController.remove
  );

router
  .route('/clear')
  .delete(optionalAuth, CartController.clear);

export const CartRoutes = router;


