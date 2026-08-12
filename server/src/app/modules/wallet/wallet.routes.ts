import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import { WalletController } from '@/app/modules/wallet/wallet.controllers';
import { WalletValidation } from '@/app/modules/wallet/wallet.validation';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/')
  .post(
    auth(USER_ROLE.rider),
    validateRequest(WalletValidation.walletAccountValidationSchema),
    WalletController.addWallet
  );

router.get('/me', auth(USER_ROLE.rider), WalletController.getMyWallet);

router
  .route('/:walletId')
  .put(
    auth(USER_ROLE.rider),
    validateRequest(WalletValidation.updateWalletAccountValidationSchema),
    WalletController.updateWallet
  )
  .delete(
    auth(USER_ROLE.rider),
    validateRequest(WalletValidation.walletIdParamValidationSchema),
    WalletController.removeWallet
  );

export const WalletRoutes = router;


