import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { CampainController } from '@/app/modules/campain/campain.controllers';
import { CampainValidation } from '@/app/modules/campain/campain.validation';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/')
  .post(
    auth(USER_ROLE.admin),
    validateRequest(CampainValidation.createCampainValidationSchema),
    CampainController.createCampain
  )
  .get(CampainController.getAllCampain);

router.get(
  '/banner/:bannerId',
  validateRequest(CampainValidation.bannerIdParamValidationSchema),
  CampainController.getCampainByBanner
);

router
  .route('/:campainId')
  .put(
    auth(USER_ROLE.admin),
    validateRequest(CampainValidation.updateCampainValidationSchema),
    CampainController.updateACampain
  )
  .delete(
    auth(USER_ROLE.admin),
    validateRequest(CampainValidation.campainIdParamValidationSchema),
    CampainController.removeACampain
  );

export const CampainRoutes = router;
