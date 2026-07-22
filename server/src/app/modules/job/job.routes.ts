import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { JobController } from '@/app/modules/job/job.controllers';
import { JobValidation } from '@/app/modules/job/job.validation';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router.get('/rider/current', auth(USER_ROLE.rider), JobController.getCurrentRiderJobs);
router.get('/rider/history', auth(USER_ROLE.rider), JobController.getRiderHistory);
router.get('/order/:orderId', auth(USER_ROLE.admin, USER_ROLE.vendor, USER_ROLE.rider), validateRequest(JobValidation.orderIdParamValidationSchema), JobController.getJobByOrderId);
router.get('/', auth(USER_ROLE.admin, USER_ROLE.vendor), JobController.getAllJobs);
router.get('/:jobId', auth(USER_ROLE.admin, USER_ROLE.vendor, USER_ROLE.rider), validateRequest(JobValidation.jobIdParamValidationSchema), JobController.getJobById);

export const JobRoutes = router;
