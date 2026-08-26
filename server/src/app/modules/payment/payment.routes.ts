import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { PaymentController } from '@/app/modules/payment/payment.controllers';
import { PaymentValidation } from '@/app/modules/payment/payment.validation';
import { AUTHENTICATED_ROLES } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/initiate')
  .post(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(PaymentValidation.initiatePaymentValidationSchema),
    PaymentController.initiatePayment
  );

router
  .route('/confirm')
  .post(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(PaymentValidation.confirmPaymentValidationSchema),
    PaymentController.confirmPayment
  );

router
  .route('/webhook/paymob')
  .get(PaymentController.paymobWebhook)
  .post(PaymentController.paymobWebhook);

router
  .route('/paymob/return')
  .get(PaymentController.paymobReturnPage);

router
  .route('/user/transctions')
  .get(auth(...AUTHENTICATED_ROLES), PaymentController.getUserTransactionHistory);

router
  .route('/')
  .get(auth(...AUTHENTICATED_ROLES), PaymentController.getAllPayments);

export const PaymentRoutes = router;

