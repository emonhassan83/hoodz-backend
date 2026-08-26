import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { JobController } from '@/app/modules/job/job.controllers';
import { JobValidation } from '@/app/modules/job/job.validation';
import { AUTHENTICATED_ROLES, USER_ROLE } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router.get(
  '/',
  auth(USER_ROLE.admin, USER_ROLE.agent),
  validateRequest(JobValidation.getAllJobsQueryValidationSchema),
  JobController.getAllJobs
);

router.get(
  '/my-requests',
  auth(USER_ROLE.rider),
  validateRequest(JobValidation.myRequestJobsQueryValidationSchema),
  JobController.myRequestJobs
);

router.get(
  '/my-jobs',
  auth(USER_ROLE.rider),
  validateRequest(JobValidation.getMyJobsQueryValidationSchema),
  JobController.getMyJobs
);

router.get(
  '/rider/:riderId',
  auth(USER_ROLE.agent, USER_ROLE.admin),
  validateRequest(JobValidation.getRiderJobsQueryValidationSchema),
  JobController.getRiderJobs
);

router.get(
  '/order/:orderId',
  auth(...AUTHENTICATED_ROLES),
  validateRequest(JobValidation.orderIdParamValidationSchema),
  JobController.getJobByOrderId
);

router.get(
  '/:jobId',
  auth(...AUTHENTICATED_ROLES),
  validateRequest(JobValidation.jobIdParamValidationSchema),
  JobController.getAJobDetails
);

export const JobRoutes = router;
