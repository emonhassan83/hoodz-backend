import { Router } from 'express';

import { SupportControllers } from '@/app/modules/support/support.controllers';
import { SupportValidation } from '@/app/modules/support/support.validation';
import auth from '@/app/middlewares/auth';
import { AUTHENTICATED_ROLES } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/')
  .post(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(SupportValidation.sendSupportEmailSchema),
    SupportControllers.sendSupportEmail
  );

export const SupportRoutes = router;
