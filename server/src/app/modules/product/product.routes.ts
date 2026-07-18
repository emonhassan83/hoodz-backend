import { Router } from 'express';

import auth, { optionalAuth } from '@/app/middlewares/auth';
import { ProductController } from '@/app/modules/product/product.controllers';
import { ProductValidation } from '@/app/modules/product/product.validation';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/')
  .post(
    auth(USER_ROLE.vendor),
    validateRequest(ProductValidation.createProductValidationSchema),
    ProductController.createProduct
  )
  .get(optionalAuth, ProductController.getAllProduct);

router
  .route('/my-products')
  .get(auth(USER_ROLE.vendor), ProductController.getMyProducts);

router
  .route('/generate-sku')
  .get(auth(USER_ROLE.vendor), ProductController.generateSku);

router
  .route('/viewed')
  .post(
    auth(USER_ROLE.user, USER_ROLE.rider, USER_ROLE.vendor, USER_ROLE.agent),
    validateRequest(ProductValidation.markProductViewedValidationSchema),
    ProductController.markProductViewed
  );

router
  .route('/recently-viewed')
  .get(
    auth(USER_ROLE.user, USER_ROLE.rider, USER_ROLE.vendor, USER_ROLE.agent),
    ProductController.getRecentlyViewedProducts
  );

router
  .route('/shop/:vendorId')
  .get(optionalAuth, ProductController.getShopProducts);

router
  .route('/:productId/notify-me')
  .post(
    auth(USER_ROLE.user, USER_ROLE.rider, USER_ROLE.vendor, USER_ROLE.agent),
    validateRequest(ProductValidation.notifyMeValidationSchema),
    ProductController.notifyMe
  );

router
  .route('/:productId')
  .get(optionalAuth, ProductController.getProductById)
  .patch(
    auth(USER_ROLE.vendor, USER_ROLE.admin),
    validateRequest(ProductValidation.updateProductValidationSchema),
    ProductController.updateProduct
  )
  .delete(
    auth(USER_ROLE.vendor, USER_ROLE.admin),
    ProductController.deleteProduct
  );

export const ProductRoutes = router;
