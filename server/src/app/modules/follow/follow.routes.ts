import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { FollowController } from '@/app/modules/follow/follow.controllers';
import { FollowValidation } from '@/app/modules/follow/follow.validation';
import { AUTHENTICATED_ROLES } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/follow/:vendorId')
  .post(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(FollowValidation.followVendorValidationSchema),
    FollowController.follow
  );

router
  .route('/unfollow/:vendorId')
  .post(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(FollowValidation.followVendorValidationSchema),
    FollowController.unfollow
  );

export const FollowRoutes = router;

