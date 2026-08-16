import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { AnalysisController } from '@/app/modules/analysis/analysis.controllers';
import { AnalysisValidation } from '@/app/modules/analysis/analysis.validation';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/')
  .get(
    auth(USER_ROLE.admin),
    validateRequest(AnalysisValidation.getDashboardValidationSchema),
    AnalysisController.getDashboard
  );

export const AnalysisRoutes = router;
