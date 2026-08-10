import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { TopUpController } from '@/app/modules/topUp/topUp.controllers';
import { TopUpValidation } from '@/app/modules/topUp/topUp.validation';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/add-wallet-money')
  .post(
    auth(USER_ROLE.user),
    validateRequest(TopUpValidation.addWalletMoneyValidationSchema),
    TopUpController.addWalletMoney
  );

export const TopUpRoutes = router;
