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
    auth(USER_ROLE.user),
    validateRequest(OrdersValidation.createOrderValidationSchema),
    OrdersController.getOrderSummary
  );

router
  .route('/')
  .post(
    auth(USER_ROLE.user),
    validateRequest(OrdersValidation.createOrderValidationSchema),
    OrdersController.createOrders
  )
  .get(auth(USER_ROLE.admin, USER_ROLE.agent), OrdersController.getAllOrders);

router
  .route('/my-orders')
  .get(
    auth(USER_ROLE.user),
    validateRequest(OrdersValidation.getMyOrdersQueryValidationSchema),
    OrdersController.getMyOrders
  );

router
  .route('/author-orders')
  .get(auth(USER_ROLE.vendor), OrdersController.getAuthorOrders);

router
  .route('/:orderId/confirm')
  .patch(
    auth(USER_ROLE.admin, USER_ROLE.agent, USER_ROLE.vendor),
    validateRequest(OrdersValidation.orderIdParamValidationSchema),
    OrdersController.confirmOrder
  );

router
  .route('/:orderId/processing')
  .patch(
    auth(USER_ROLE.admin, USER_ROLE.vendor),
    validateRequest(OrdersValidation.orderIdParamValidationSchema),
    OrdersController.processOrder
  );

router
  .route('/:orderId/preparing')
  .patch(
    auth(USER_ROLE.admin, USER_ROLE.vendor),
    validateRequest(OrdersValidation.orderIdParamValidationSchema),
    OrdersController.processOrder
  );

router
  .route('/:orderId/out-for-delivery')
  .patch(
    auth(USER_ROLE.admin, USER_ROLE.agent, USER_ROLE.vendor),
    validateRequest(OrdersValidation.orderIdParamValidationSchema),
    OrdersController.markOutForDelivery
  );

router
  .route('/:orderId/status')
  .patch(
    auth(USER_ROLE.admin, USER_ROLE.agent),
    validateRequest(OrdersValidation.changeOrderStatusValidationSchema),
    OrdersController.changeOrderStatus
  );

router
  .route('/:orderId/reverse-delivery')
  .post(
    auth(USER_ROLE.admin),
    validateRequest(OrdersValidation.orderIdParamValidationSchema),
    OrdersController.reverseDelivery
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


