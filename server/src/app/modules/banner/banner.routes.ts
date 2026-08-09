import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { BannerController } from '@/app/modules/banner/banner.controllers';
import { BannerValidation } from '@/app/modules/banner/banner.validation';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/')
  .post(
    auth(USER_ROLE.admin),
    validateRequest(BannerValidation.addBannerValidationSchema),
    BannerController.add
  )
  .get(BannerController.viewAllBanner);

router
  .route('/:bannerId')
  .put(
    auth(USER_ROLE.admin),
    validateRequest(BannerValidation.updateBannerValidationSchema),
    BannerController.update
  )
  .delete(
    auth(USER_ROLE.admin),
    validateRequest(BannerValidation.removeBannerValidationSchema),
    BannerController.remove
  );

router
  .route('/toggle/:bannerId')
  .patch(
    auth(USER_ROLE.admin),
    validateRequest(BannerValidation.toggleBannerStatusValidationSchema),
    BannerController.toggleStatus
  );

export const BannerRoutes = router;


