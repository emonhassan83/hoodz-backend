import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { SettingController } from '@/app/modules/settings/settings.controllers';
import { SettingValidation } from '@/app/modules/settings/settings.validation';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/generals')
  .post(
    auth(USER_ROLE.vendor),
    validateRequest(SettingValidation.updateGeneralsZodSchema),
    SettingController.updateGenerals
  )
  .get(SettingController.getSettingGenerals);

router
  .route('/:key')
  .post(
    auth(USER_ROLE.admin),
    validateRequest(SettingValidation.createOrUpdateSettingZodSchema),
    SettingController.createOrUpdate
  );

router.route('/').get(SettingController.getSetting);

export const SettingsRoutes = router;


