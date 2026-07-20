import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { OrdersController } from '@/app/modules/orders/orders.controllers';
import { OrdersValidation } from '@/app/modules/orders/orders.validation';
import { AUTHENTICATED_ROLES, USER_ROLE } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/summary')
  .post(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(OrdersValidation.createOrderValidationSchema),
    OrdersController.getOrderSummary
  );

router
  .route('/')
  .post(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(OrdersValidation.createOrderValidationSchema),
    OrdersController.createOrders
  )
  .get(auth(USER_ROLE.admin), OrdersController.getAllOrders);

router
  .route('/my-orders')
  .get(auth(...AUTHENTICATED_ROLES), OrdersController.getMyOrders);

router
  .route('/author-orders')
  .get(auth(USER_ROLE.vendor, USER_ROLE.admin), OrdersController.getAuthorOrders);

router
  .route('/:orderId/status')
  .patch(
    auth(USER_ROLE.admin, USER_ROLE.vendor),
    validateRequest(OrdersValidation.changeOrderStatusValidationSchema),
    OrdersController.changeOrderStatus
  );

router
  .route('/:orderId')
  .get(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(OrdersValidation.orderIdParamValidationSchema),
    OrdersController.getOrdersById
  )
  .delete(
    auth(USER_ROLE.admin),
    validateRequest(OrdersValidation.orderIdParamValidationSchema),
    OrdersController.deleteOrder
  );

export const OrdersRoutes = router;
