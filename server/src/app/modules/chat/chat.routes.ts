import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { ChatController } from '@/app/modules/chat/chat.controllers';
import { ChatValidation } from '@/app/modules/chat/chat.validation';
import { AUTHENTICATED_ROLES } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/')
  .post(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(ChatValidation.createChatValidationSchema),
    ChatController.createChat
  )
  .get(auth(...AUTHENTICATED_ROLES), ChatController.getMyChatList);

router
  .route('/order/:orderId')
  .get(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(ChatValidation.orderIdParamValidationSchema),
    ChatController.getChatOrderById
  );

router
  .route('/:chatId')
  .get(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(ChatValidation.chatIdParamValidationSchema),
    ChatController.getChatId
  );

export const ChatRoutes = router;


