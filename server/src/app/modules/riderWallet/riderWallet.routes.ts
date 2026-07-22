import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { RiderWalletController } from '@/app/modules/riderWallet/riderWallet.controllers';
import { RiderWalletValidation } from '@/app/modules/riderWallet/riderWallet.validation';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router.get('/summary', auth(USER_ROLE.rider), RiderWalletController.getSummary);
router.get(
  '/transactions',
  auth(USER_ROLE.rider),
  RiderWalletController.getTransactions
);
router.post(
  '/withdraw-request',
  auth(USER_ROLE.rider),
  validateRequest(RiderWalletValidation.withdrawRequestValidationSchema),
  RiderWalletController.createWithdrawRequest
);
router.patch(
  '/withdraw/:withdrawId/approve',
  auth(USER_ROLE.admin),
  validateRequest(RiderWalletValidation.withdrawIdParamValidationSchema),
  RiderWalletController.approveWithdraw
);
router.patch(
  '/withdraw/:withdrawId/reject',
  auth(USER_ROLE.admin),
  validateRequest(RiderWalletValidation.rejectWithdrawValidationSchema),
  RiderWalletController.rejectWithdraw
);

export const RiderWalletRoutes = router;

