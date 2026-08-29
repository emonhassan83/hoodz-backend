import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import { VendorTransctionController } from '@/app/modules/vendorTransction/vendorTransction.controllers';
import { VendorTransctionValidation } from '@/app/modules/vendorTransction/vendorTransction.validation';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/my-payment-transction')
  .get(auth(USER_ROLE.vendor), VendorTransctionController.myPaymentTransction);

router
  .route('/')
  .get(
    auth(USER_ROLE.admin),
    validateRequest(VendorTransctionValidation.vendorIdQueryValidationSchema),
    VendorTransctionController.getVendorTransction
  );

export const VendorTransctionRoutes = router;
