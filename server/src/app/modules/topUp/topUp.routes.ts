import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { TopUpController } from '@/app/modules/topUp/topUp.controllers';
import { TopUpValidation } from '@/app/modules/topUp/topUp.validation';
import { AUTHENTICATED_ROLES, USER_ROLE } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/add-wallet-money')
  .post(
    auth(USER_ROLE.user),
    validateRequest(TopUpValidation.addWalletMoneyValidationSchema),
    TopUpController.addWalletMoney
  );

router
  .route('/transactions')
  .get(auth(...AUTHENTICATED_ROLES), TopUpController.viewAllTranscrion);

router
  .route('/transactions/:topUpId')
  .get(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(TopUpValidation.topUpIdParamValidationSchema),
    TopUpController.viewADetailsTransction
  );

export const TopUpRoutes = router;
