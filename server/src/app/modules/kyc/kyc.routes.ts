import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { KycController } from '@/app/modules/kyc/kyc.controllers';
import { KycValidation } from '@/app/modules/kyc/kyc.validation';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/')
  .post(
    auth(USER_ROLE.rider),
    validateRequest(KycValidation.addKycRequestValidationSchema),
    KycController.addKycRequest
  )
  .get(auth(USER_ROLE.admin), KycController.getAll);

router
  .route('/:id')
  .get(auth(USER_ROLE.admin, USER_ROLE.rider), KycController.getA);

router
  .route('/:id/status')
  .patch(
    auth(USER_ROLE.admin),
    validateRequest(KycValidation.changeKycStatusValidationSchema),
    KycController.changeStatus
  );

export const KycRoutes = router;
