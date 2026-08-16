import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { MetaController } from '@/app/modules/meta/meta.controllers';
import { MetaValidation } from '@/app/modules/meta/meta.validation';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/user/guest')
  .get(
    validateRequest(MetaValidation.getGuestMetaValidationSchema),
    MetaController.getGuestMeta
  );

router
  .route('/user')
  .get(
    auth(USER_ROLE.user),
    validateRequest(MetaValidation.getUserMetaValidationSchema),
    MetaController.getUserMeta
  );

router
  .route('/rider')
  .get(auth(USER_ROLE.rider), MetaController.getRiderMeta);

router
  .route('/admin')
  .get(
    auth(USER_ROLE.admin),
    validateRequest(MetaValidation.getAdminMetaValidationSchema),
    MetaController.getAdminMeta
  );

router
  .route('/vendor')
  .get(
    auth(USER_ROLE.vendor),
    validateRequest(MetaValidation.getVendorMetaValidationSchema),
    MetaController.getVendorMeta
  );

export const MetaRoutes = router;
