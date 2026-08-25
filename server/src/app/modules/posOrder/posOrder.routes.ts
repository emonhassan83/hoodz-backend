import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { PosOrderController } from '@/app/modules/posOrder/posOrder.controllers';
import { PosOrderValidation } from '@/app/modules/posOrder/posOrder.validation';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/')
  .post(
    auth(USER_ROLE.vendor),
    validateRequest(PosOrderValidation.createPosOrderValidationSchema),
    PosOrderController.create
  )
  .get(auth(USER_ROLE.admin, USER_ROLE.vendor), PosOrderController.getPosOrders);

router
  .route('/:posOrderId')
  .get(
    auth(USER_ROLE.admin, USER_ROLE.vendor),
    validateRequest(PosOrderValidation.posOrderIdParamValidationSchema),
    PosOrderController.getAPosOrder
  )
  .put(
    auth(USER_ROLE.admin, USER_ROLE.vendor),
    validateRequest(PosOrderValidation.updatePosOrderValidationSchema),
    PosOrderController.updateAPosOrder
  )
  .delete(
    auth(USER_ROLE.admin, USER_ROLE.vendor),
    validateRequest(PosOrderValidation.posOrderIdParamValidationSchema),
    PosOrderController.removeAPosOrder
  );

export const PosOrderRoutes = router;
