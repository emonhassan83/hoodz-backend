import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { AuthControllers } from '@/app/modules/auth/auth.controllers';
import { checkDuplicateUser } from '@/app/modules/auth/auth.middlewares';
import { AuthValidation } from '@/app/modules/auth/auth.validation';
import { AUTHENTICATED_ROLES } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

// ─── Signup ────────────────────────────────────────────────────────────────

router
  .route('/signup-with-email')
  .post(
    validateRequest(AuthValidation.signupWithEmailSchema),
    checkDuplicateUser,
    AuthControllers.signupWithEmail
  );

router
  .route('/signup-with-phone')
  .post(
    validateRequest(AuthValidation.signupWithPhoneSchema),
    checkDuplicateUser,
    AuthControllers.signupWithPhone
  );

// ─── Social Auth ───────────────────────────────────────────────────────────

router
  .route('/google')
  .post(
    validateRequest(AuthValidation.googleZodValidationSchema),
    AuthControllers.registerWithGoogle
  );

router
  .route('/apple')
  .post(
    validateRequest(AuthValidation.appleZodValidationSchema),
    AuthControllers.registerWithApple
  );

// ─── Login ─────────────────────────────────────────────────────────────────

router
  .route('/login-with-email')
  .post(
    validateRequest(AuthValidation.loginValidationSchema),
    AuthControllers.loginWithEmail
  );

router
  .route('/login-with-phone')
  .post(
    validateRequest(AuthValidation.loginWithPhoneValidationSchema),
    AuthControllers.loginWithPhone
  );

// ─── Password ──────────────────────────────────────────────────────────────

router
  .route('/forgot-password')
  .post(
    validateRequest(AuthValidation.forgotPasswordValidationSchema),
    AuthControllers.forgotPassword
  );

router
  .route('/reset-password')
  .post(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(AuthValidation.resetPasswordValidationSchema),
    AuthControllers.resetPassword
  );

router
  .route('/change-password')
  .post(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(AuthValidation.changePasswordValidationSchema),
    AuthControllers.changePassword
  );

// ─── Session ───────────────────────────────────────────────────────────────

router
  .route('/logout')
  .post(auth(...AUTHENTICATED_ROLES), AuthControllers.logoutUser);

router.route('/refresh-token').post(AuthControllers.refreshToken);

export const AuthRoutes = router;


