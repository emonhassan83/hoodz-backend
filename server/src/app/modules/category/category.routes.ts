import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { CategoryController } from '@/app/modules/category/category.controllers';
import { CategoryValidation } from '@/app/modules/category/category.validation';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/')
  .post(
    auth(USER_ROLE.admin),
    validateRequest(CategoryValidation.createCategoryValidationSchema),
    CategoryController.create
  )
  .get(CategoryController.getAll);

router
  .route('/brand-type')
  .get(
    validateRequest(CategoryValidation.getCategoryByBrandTypeValidationSchema),
    CategoryController.getCategoryByBrandType
  );

router
  .route('/:categoryId/shops')
  .get(
    validateRequest(CategoryValidation.getCategoryByShopValidationSchema),
    CategoryController.getCategoryByShop
  );

router
  .route('/:categoryId')
  .put(
    auth(USER_ROLE.admin),
    validateRequest(CategoryValidation.updateCategoryValidationSchema),
    CategoryController.updateA
  )
  .delete(auth(USER_ROLE.admin), CategoryController.deleteA);

export const CategoryRoutes = router;


