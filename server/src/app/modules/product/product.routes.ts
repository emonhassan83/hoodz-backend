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
  .route('/admin')
  .post(
    auth(USER_ROLE.admin),
    validateRequest(ProductValidation.createProductByAdminValidationSchema),
    ProductController.createProductByAdmin
  );

router
  .route('/generate-sku')
  .get(auth(USER_ROLE.vendor), ProductController.generateSku);

router
  .route('/trending')
  .get(optionalAuth, ProductController.getTrendingProducts);

router
  .route('/recently-viewed')
  .get(optionalAuth, ProductController.getRecentlyViewedProducts);

router
  .route('/notify-me/:productId')
  .post(
    auth(USER_ROLE.user, USER_ROLE.rider, USER_ROLE.vendor, USER_ROLE.agent),
    validateRequest(ProductValidation.notifyMeValidationSchema),
    ProductController.notifyMe
  );

router
  .route('/viewed/:productId')
  .patch(
    optionalAuth,
    validateRequest(ProductValidation.markProductViewedValidationSchema),
    ProductController.markProductViewed
  );

router
  .route('/shop/:vendorId')
  .get(
    optionalAuth,
    validateRequest(ProductValidation.shopProductsValidationSchema),
    ProductController.getShopProducts
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

