import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { CompanyDepositController } from '@/app/modules/companyDeposit/companyDeposit.controllers';
import { CompanyDepositValidation } from '@/app/modules/companyDeposit/companyDeposit.validation';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router.get('/', auth(USER_ROLE.admin), CompanyDepositController.getAll);
router.get('/my', auth(USER_ROLE.rider), CompanyDepositController.getMy);
router.get(
  '/:depositId',
  auth(USER_ROLE.admin, USER_ROLE.rider, USER_ROLE.vendor),
  validateRequest(CompanyDepositValidation.depositIdParamValidationSchema),
  CompanyDepositController.getById
);

export const CompanyDepositRoutes = router;

