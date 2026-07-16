import { Router } from 'express';

import auth from '@/app/middlewares/auth';
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
  .get(ProductController.getAllProduct);

router
  .route('/my-products')
  .get(auth(USER_ROLE.vendor), ProductController.getMyProducts);

router
  .route('/generate-sku')
  .get(auth(USER_ROLE.vendor), ProductController.generateSku);

router
  .route('/shop/:vendorId')
  .get(ProductController.getShopProducts);

router
  .route('/:productId')
  .get(ProductController.getProductById)
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
