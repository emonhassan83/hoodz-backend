import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { AUTHENTICATED_ROLES, USER_ROLE } from '@/app/modules/user/user.constant';
import { WalletTransactionController } from '@/app/modules/walletTransaction/walletTransaction.controllers';
import { WalletTransactionValidation } from '@/app/modules/walletTransaction/walletTransaction.validation';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/')
  .get(auth(...AUTHENTICATED_ROLES), WalletTransactionController.getAllIntoDB);

router
  .route('/refund-to-card')
  .post(
    auth(USER_ROLE.user),
    validateRequest(WalletTransactionValidation.refundToCardValidationSchema),
    WalletTransactionController.refundToCard
  );

router
  .route('/:transactionId')
  .get(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(
      WalletTransactionValidation.walletTransactionIdParamValidationSchema
    ),
    WalletTransactionController.getAIntoDB
  );

export const WalletTransactionRoutes = router;
