import { Router } from 'express';

import auth, { optionalAuth } from '@/app/middlewares/auth';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import { VoucherController } from '@/app/modules/voucher/voucher.controllers';
import { VoucherValidation } from '@/app/modules/voucher/voucher.validation';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/')
  .post(
    auth(USER_ROLE.admin, USER_ROLE.vendor, USER_ROLE.agent),
    validateRequest(VoucherValidation.addVoucherValidationSchema),
    VoucherController.addVouture
  );

router
  .route('/global')
  .get(auth(USER_ROLE.admin, USER_ROLE.agent), VoucherController.getGlobalVoutures);

router
  .route('/shopwise/:vendorId')
  .get(
    auth(USER_ROLE.vendor),
    validateRequest(VoucherValidation.vendorIdParamValidationSchema),
    VoucherController.getShopwiseVoutures
  );

router
  .route('/shop/:vendorId/active')
  .get(
    optionalAuth,
    validateRequest(VoucherValidation.vendorIdParamValidationSchema),
    VoucherController.getActiveShopAndGlobalVoutures
  );

router
  .route('/compension')
  .get(auth(USER_ROLE.admin, USER_ROLE.agent, USER_ROLE.user), VoucherController.getCompensionVoutures);

router
  .route('/status/:voucherId')
  .patch(
    auth(USER_ROLE.admin, USER_ROLE.vendor, USER_ROLE.agent),
    validateRequest(VoucherValidation.updateVoucherStatusValidationSchema),
    VoucherController.updateVoutureStatus
  );

router
  .route('/:voucherId')
  .get(
    optionalAuth,
    validateRequest(VoucherValidation.voucherIdParamValidationSchema),
    VoucherController.getAVouture
  )
  .put(
    auth(USER_ROLE.admin, USER_ROLE.vendor, USER_ROLE.agent),
    validateRequest(VoucherValidation.updateVoucherValidationSchema),
    VoucherController.updateAVouture
  )
  .delete(
    auth(USER_ROLE.admin, USER_ROLE.vendor, USER_ROLE.agent),
    validateRequest(VoucherValidation.voucherIdParamValidationSchema),
    VoucherController.removeVouture
  );

export const VoucherRoutes = router;
