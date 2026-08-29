import { Router } from 'express';

import auth, { optionalAuth } from '@/app/middlewares/auth';
import {
  AUTHENTICATED_ROLES,
  USER_ROLE,
} from '@/app/modules/user/user.constant';
import { UserControllers } from '@/app/modules/user/user.controllers';
import { UserValidation } from '@/app/modules/user/user.validation';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

// ─── Admin ─────────────────────────────────────────────────────────────────

router
  .route('/')
  .get(auth(USER_ROLE.admin), UserControllers.getAllUsers);

router
  .route('/vendors/invite')
  .post(
    auth(USER_ROLE.admin),
    validateRequest(UserValidation.inviteVendorValidationSchema),
    UserControllers.inviteVendor
  );

router
  .route('/vendors/:vendorId/pay')
  .post(
    auth(USER_ROLE.admin),
    validateRequest(UserValidation.payVendorValidationSchema),
    UserControllers.payVendor
  );

router
  .route('/agents/invite')
  .post(
    auth(USER_ROLE.admin),
    validateRequest(UserValidation.inviteAgentValidationSchema),
    UserControllers.inviteAgent
  );

// ─── Profile ───────────────────────────────────────────────────────────────

router
  .route('/referral-code')
  .post(
    auth(USER_ROLE.user),
    validateRequest(UserValidation.applyReferralCodeValidationSchema),
    UserControllers.applyReferralCodeToUser
  );
// thisMonthTransctions
router
  .route('/change-email')
  .put(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(UserValidation.changeEmailZodSchema),
    UserControllers.changedEmail
  );

router
  .route('/location')
  .put(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(UserValidation.updateLocationValidationSchema),
    UserControllers.updateMyLocation
  );

router
  .route('/delivery-location')
  .put(
    auth(USER_ROLE.user),
    validateRequest(UserValidation.updateDeliveryLocationValidationSchema),
    UserControllers.updateMyDeliveryLocation
  );

router
  .route('/security-code')
  .put(
    auth(USER_ROLE.rider),
    validateRequest(UserValidation.securityCodeValidationSchema),
    UserControllers.setOrUpdateSecurityCode
  );

router
  .route('/security-code/verify')
  .post(
    auth(USER_ROLE.rider),
    validateRequest(UserValidation.verifySecurityCodeValidationSchema),
    UserControllers.verifySecurityCode
  );

router
  .route('/nearby-shops')
  .get(
    optionalAuth,
    validateRequest(UserValidation.nearbyShopsValidationSchema),
    UserControllers.getNearbyShops
  );

// ─── User by ID ────────────────────────────────────────────────────────────

router
  .route('/featured-vendors')
  .get(optionalAuth, UserControllers.getFeaturedVendors);

router
  .route('/shops/:vendorId/details')
  .get(
    optionalAuth,
    validateRequest(UserValidation.shopDetailsValidationSchema),
    UserControllers.getShopDetails
  );

router
  .route('/:userId')
  .get(auth(...AUTHENTICATED_ROLES), UserControllers.getAUser)
  .put(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(UserValidation.updateUserValidationSchema),
    UserControllers.updateUserProfile
  )
  .patch(
    auth(USER_ROLE.admin),
    validateRequest(UserValidation.changeStatusValidationSchema),
    UserControllers.updateUserStatus
  )
  .delete(
    auth(...AUTHENTICATED_ROLES),
    UserControllers.deleteUserProfile
  );

export const UserRoutes = router;

