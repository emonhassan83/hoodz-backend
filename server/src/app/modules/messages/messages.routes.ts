import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { MessagesController } from '@/app/modules/messages/messages.controllers';
import { MessagesValidation } from '@/app/modules/messages/messages.validation';
import { AUTHENTICATED_ROLES } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/chat/:chatId')
  .get(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(MessagesValidation.getMessagesByChatIdValidationSchema),
    MessagesController.getMessagesByChatId
  );

export const MessagesRoutes = router;


