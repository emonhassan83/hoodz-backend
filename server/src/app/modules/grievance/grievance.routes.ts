import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { GrievanceController } from '@/app/modules/grievance/grievance.controllers';
import { GrievanceValidation } from '@/app/modules/grievance/grievance.validation';
import { AUTHENTICATED_ROLES, USER_ROLE } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/')
  .post(
    auth(USER_ROLE.user),
    validateRequest(GrievanceValidation.createGrievanceValidationSchema),
    GrievanceController.createGrievance
  )
  .get(
    auth(USER_ROLE.admin, USER_ROLE.agent, USER_ROLE.user),
    GrievanceController.getAllGrievances
  );

router
  .route('/status/:grievanceId')
  .patch(
    auth(USER_ROLE.admin, USER_ROLE.agent),
    validateRequest(GrievanceValidation.resolveGrievanceValidationSchema),
    GrievanceController.resolveGrievance
  );

router
  .route('/:grievanceId')
  .get(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(GrievanceValidation.grievanceIdParamValidationSchema),
    GrievanceController.getAGrievance
  )
  .delete(
    auth(USER_ROLE.admin, USER_ROLE.agent),
    validateRequest(GrievanceValidation.grievanceIdParamValidationSchema),
    GrievanceController.deleteGrievance
  );

export const GrievanceRoutes = router;
