import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { NotificationControllers } from '@/app/modules/notification/notification.controllers';
import { NotificationValidation } from '@/app/modules/notification/notification.validation';
import {
  AUTHENTICATED_ROLES,
  USER_ROLE,
} from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/')
  .post(
    auth(USER_ROLE.admin),
    validateRequest(NotificationValidation.createNotificationSchema),
    NotificationControllers.createNotification
  )
  .get(
    auth(...AUTHENTICATED_ROLES),
    NotificationControllers.getAllNotifications
  );

router
  .route('/my-notifications')
  .delete(
    auth(...AUTHENTICATED_ROLES),
    NotificationControllers.deleteAllNotifications
  );

router
  .route('/:id')
  .delete(
    auth(...AUTHENTICATED_ROLES),
    NotificationControllers.deleteANotification
  );

router
  .route('/')
  .patch(
    auth(...AUTHENTICATED_ROLES),
    NotificationControllers.markAsDoneNotification
  );

export const NotificationRoutes = router;
