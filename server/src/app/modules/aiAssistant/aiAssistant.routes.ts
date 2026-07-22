import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { AiAssistantController } from '@/app/modules/aiAssistant/aiAssistant.controllers';
import { AiAssistantValidation } from '@/app/modules/aiAssistant/aiAssistant.validation';
import { AUTHENTICATED_ROLES } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/message')
  .post(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(AiAssistantValidation.sendMessageValidationSchema),
    AiAssistantController.sendMessage
  );

export const AiAssistantRoutes = router;

