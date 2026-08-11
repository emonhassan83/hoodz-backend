import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { DepositController } from '@/app/modules/deposit/deposit.controllers';
import { DepositValidation } from '@/app/modules/deposit/deposit.validation';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/')
  .post(
    auth(USER_ROLE.rider),
    validateRequest(DepositValidation.submitDepositValidationSchema),
    DepositController.submitDeposit
  )
  .get(auth(USER_ROLE.admin), DepositController.getAll);

router.get('/my', auth(USER_ROLE.rider), DepositController.getMy);

router.patch(
  '/verify/:depositId',
  auth(USER_ROLE.admin),
  validateRequest(DepositValidation.verifyDepositValidationSchema),
  DepositController.verifyDeposit
);

router.get(
  '/:depositId',
  auth(USER_ROLE.admin, USER_ROLE.rider),
  validateRequest(DepositValidation.depositIdParamValidationSchema),
  DepositController.getById
);

export const DepositRoutes = router
