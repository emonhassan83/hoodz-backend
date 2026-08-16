import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { ReviewController } from '@/app/modules/review/review.controllers';
import { ReviewValidation } from '@/app/modules/review/review.validation';
import { AUTHENTICATED_ROLES, USER_ROLE } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/')
  .post(
    auth(USER_ROLE.user),
    validateRequest(ReviewValidation.createReviewValidationSchema),
    ReviewController.create
  );

router
  .route('/author/:authorId')
  .get(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(ReviewValidation.authorIdParamValidationSchema),
    ReviewController.getReviewByAuthor
  );

router
  .route('/product/:productId')
  .get(
    validateRequest(ReviewValidation.productIdParamValidationSchema),
    ReviewController.getReviewByProduct
  );

export const ReviewRoutes = router;
