import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { AUTHENTICATED_ROLES, USER_ROLE } from '@/app/modules/user/user.constant';
import { WithdrawController } from '@/app/modules/withdraw/withdraw.controllers';
import { WithdrawValidation } from '@/app/modules/withdraw/withdraw.validation';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/')
  .post(
    auth(USER_ROLE.rider),
    validateRequest(WithdrawValidation.addWithdrawValidationSchema),
    WithdrawController.addWithdrawRequest
  )
  .get(auth(USER_ROLE.admin), WithdrawController.getAllWithdraws);

router
  .route('/my')
  .get(auth(USER_ROLE.rider), WithdrawController.myWithdraws);

router
  .route('/status/:withdrawId')
  .patch(
    auth(USER_ROLE.admin),
    validateRequest(WithdrawValidation.changeWithdrawStatusValidationSchema),
    WithdrawController.changedWithdrawStatus
  );

router
  .route('/:withdrawId')
  .get(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(WithdrawValidation.withdrawIdParamValidationSchema),
    WithdrawController.getAWithdraw
  );

export const WithdrawRoutes = router;
