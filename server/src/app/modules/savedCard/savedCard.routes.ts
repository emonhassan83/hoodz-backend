import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { SavedCardController } from '@/app/modules/savedCard/savedCard.controllers';
import { SavedCardValidation } from '@/app/modules/savedCard/savedCard.validation';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/')
  .get(auth(USER_ROLE.user), SavedCardController.getMyCards);

router
  .route('/setup')
  .post(
    auth(USER_ROLE.user),
    validateRequest(SavedCardValidation.setupSavedCardValidationSchema),
    SavedCardController.setupSavedCard
  );

router
  .route('/default/:cardId')
  .patch(
    auth(USER_ROLE.user),
    validateRequest(SavedCardValidation.savedCardIdParamValidationSchema),
    SavedCardController.setDefaultCard
  );

router
  .route('/:cardId')
  .delete(
    auth(USER_ROLE.user),
    validateRequest(SavedCardValidation.savedCardIdParamValidationSchema),
    SavedCardController.deleteCard
  );

export const SavedCardRoutes = router;
