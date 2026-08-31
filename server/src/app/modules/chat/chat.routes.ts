import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { ChatController } from '@/app/modules/chat/chat.controllers';
import { ChatValidation } from '@/app/modules/chat/chat.validation';
import { AUTHENTICATED_ROLES, USER_ROLE } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/agent/customers')
  .get(auth(USER_ROLE.agent), ChatController.getAgentCustomers);

router
  .route('/')
  .post(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(ChatValidation.createChatValidationSchema),
    ChatController.createChat
  )
  .get(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(ChatValidation.getMyChatListQueryValidationSchema),
    ChatController.getMyChatList
  );

router
  .route('/order/:orderId')
  .get(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(ChatValidation.orderIdParamValidationSchema),
    ChatController.getChatOrderById
  );

router
  .route('/user/:participantId')
  .get(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(ChatValidation.participantIdParamValidationSchema),
    ChatController.getChatByUserId
  );

router
  .route('/:chatId')
  .get(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(ChatValidation.chatIdParamValidationSchema),
    ChatController.getChatId
  );

export const ChatRoutes = router;


