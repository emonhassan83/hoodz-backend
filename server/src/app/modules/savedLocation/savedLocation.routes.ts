import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { SavedLocationController } from '@/app/modules/savedLocation/savedLocation.controllers';
import { SavedLocationValidation } from '@/app/modules/savedLocation/savedLocation.validation';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/')
  .post(
    auth(USER_ROLE.user),
    validateRequest(SavedLocationValidation.saveLocationValidationSchema),
    SavedLocationController.saveALocation
  )
  .get(auth(USER_ROLE.user), SavedLocationController.getMyLocation);

router
  .route('/:locationId')
  .delete(
    auth(USER_ROLE.user),
    validateRequest(SavedLocationValidation.locationIdParamValidationSchema),
    SavedLocationController.deleteALocation
  );

export const SavedLocationRoutes = router;
