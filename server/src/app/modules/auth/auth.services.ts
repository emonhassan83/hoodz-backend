import { HttpStatusCode } from 'axios';
import { hash } from 'bcrypt';

import { env } from '@/app/configs/env.configs';
import { SALT_ROUNDS } from '@/app/constant';
import ApiError from '@/app/errors/ApiError';
import {
  buildSignupAddressPayload,
  processSignup,
  resolveReferralData,
  generateTokens,
  createToken,
  verifyToken,
} from '@/app/modules/auth/auth.helpers';
import {
  TExpiresIn,
  TGoogleLoginPayload,
  TAppleLoginPayload,
  TLoginWithEmail,
  TLoginWithPhone,
  TForgotPasswordPayload,
  TResetPasswordPayload,
  TChangePasswordPayload,
} from '@/app/modules/auth/auth.types';
import { CartService } from '@/app/modules/cart/cart.services';
import { CoinService } from '@/app/modules/coin/coin.services';
import { OtpServices } from '@/app/modules/otp/otp.services';
import { ProductService } from '@/app/modules/product/product.services';
import { SearchService } from '@/app/modules/search/search.services';
import { REGISTER_WITH, USER_ROLE, USER_STATUS } from '@/app/modules/user/user.constant';
import { ISignUpWithEmail, ISignUpWithPhone } from '@/app/modules/user/user.interface';
import { User } from '@/app/modules/user/user.model';

// ─── Signup ────────────────────────────────────────────────────────────────

/** Registers a user with email credentials. */
export const signupWithEmail = async (traceId: string, payload: ISignUpWithEmail) => {
  const user = await processSignup(payload, traceId);
  await CoinService.addWelcomeBonus(user._id.toString());
  return user;
};

/** Registers a user with phone credentials. */
export const signupWithPhone = async (traceId: string, payload: ISignUpWithPhone) => {
  const user = await processSignup(payload as unknown as ISignUpWithEmail, traceId);
  await CoinService.addWelcomeBonus(user._id.toString());
  return user;
};

// ─── Social Auth ───────────────────────────────────────────────────────────

/** Registers or logs in a social auth user for the selected provider. */
const registerWithSocialAuth = async (
  traceId: string,
  provider: typeof REGISTER_WITH.google | typeof REGISTER_WITH.apple,
  payload: TGoogleLoginPayload | TAppleLoginPayload,
  guestId?: string
) => {
  const role = payload.role ?? USER_ROLE.user;
  if (![USER_ROLE.user, USER_ROLE.rider].includes(role as any)) {
    throw new ApiError(
      HttpStatusCode.Forbidden,
      'Only user and rider can register directly',
      traceId
    );
  }

  const registrationStatus =
    role === USER_ROLE.rider ? USER_STATUS.pending : USER_STATUS.active;

  const profileData = buildSignupAddressPayload({
    name: payload.name,
    email: payload.email,
    photoUrl: payload.photoUrl,
    fcmToken: payload.fcmToken,
    profileAvatar: payload.profileAvatar,
    address: payload.address,
    latitude: payload.latitude,
    longitude: payload.longitude,
    deliveryAddress: payload.deliveryAddress,
    deliveryLatitude: payload.deliveryLatitude,
    deliveryLongitude: payload.deliveryLongitude,
    timeZone: payload.timeZone,
    referralCode: payload.referralCode,
    isLegalTermsAccepted: payload.isLegalTermsAccepted,
  });

  const user = await User.isUserExistsByEmail(payload.email as string);

  if (user) {
    if (user.registerWith !== provider) {
      throw new ApiError(
        HttpStatusCode.BadRequest,
        `This account is registered with ${user.registerWith}, please use that method.`,
        traceId
      );
    }

    const referralData = user.isDeleted && !user.referredBy
      ? await resolveReferralData(payload.referralCode, traceId, user._id.toString())
      : {};
    const updatePayload = user.isDeleted
      ? {
          ...profileData,
          ...referralData,
          role,
          status: registrationStatus,
          isDeleted: false,
          expireAt: null,
        }
      : profileData;

    const updatedUser = await User.findByIdAndUpdate(user._id, updatePayload, {
      returnDocument: 'after',
    });

    if (user.isDeleted && !updatedUser) {
      throw new ApiError(
        HttpStatusCode.InternalServerError,
        'Failed to reactivate deleted user.',
        traceId
      );
    }

    const authUser = (updatedUser ?? user) as any;
    await SearchService.mergeGuestSearchHistory(guestId, authUser._id.toString());
    await CartService.mergeGuestCart(guestId, authUser._id.toString());
    await ProductService.mergeGuestRecentlyViewed(guestId, authUser._id.toString());
    return generateTokens(authUser);
  }

  const referralData = await resolveReferralData(payload.referralCode, traceId);
  const newUser = await User.create({
    ...profileData,
    ...referralData,
    role,
    status: registrationStatus,
    registerWith: provider,
    expireAt: null as any,
  });

  if (!newUser) {
    throw new ApiError(HttpStatusCode.InternalServerError, 'Failed to create user!', traceId);
  }

  await SearchService.mergeGuestSearchHistory(guestId, newUser._id.toString());
  await CartService.mergeGuestCart(guestId, newUser._id.toString());
  await ProductService.mergeGuestRecentlyViewed(guestId, newUser._id.toString());
  await CoinService.addWelcomeBonus(newUser._id.toString());
  return generateTokens(newUser);
};

/** Registers or logs in a user with Google auth. */
export const registerWithGoogle = (
  traceId: string,
  payload: TGoogleLoginPayload,
  guestId?: string
) => registerWithSocialAuth(traceId, REGISTER_WITH.google, payload, guestId);

/** Registers or logs in a user with Apple auth. */
export const registerWithApple = (
  traceId: string,
  payload: TAppleLoginPayload,
  guestId?: string
) => registerWithSocialAuth(traceId, REGISTER_WITH.apple, payload, guestId);

// ─── Login ─────────────────────────────────────────────────────────────────

/** Logs in a user with email and password. */
export const loginWithEmail = async (
  traceId: string,
  payload: TLoginWithEmail,
  guestId?: string
) => {
  const { email, password, fcmToken } = payload;

  const user = await User.findOne({ email }).select('+password');
  if (!user || user.isDeleted) {
    throw new ApiError(HttpStatusCode.NotFound, 'This user is not found!', traceId);
  }

  if (!(await User.isPasswordMatched(password, user.password))) {
    throw new ApiError(HttpStatusCode.Forbidden, 'Password do not matched', traceId);
  }

  if (!user.isSignUpOtpVerified) {
    throw new ApiError(HttpStatusCode.Forbidden, 'Your profile is not verified', traceId);
  }

  if (fcmToken) {
    await User.findByIdAndUpdate(user._id, { fcmToken });
  }

  await SearchService.mergeGuestSearchHistory(guestId, user._id.toString());
  await CartService.mergeGuestCart(guestId, user._id.toString());
  await ProductService.mergeGuestRecentlyViewed(guestId, user._id.toString());
  return generateTokens(user as any);
};

/** Starts phone login by sending an OTP to the user's phone. */
export const loginWithPhone = async (traceId: string, payload: TLoginWithPhone) => {
  const { phone, fcmToken } = payload;

  const user = await User.findOne({ phone });
  if (!user || user.isDeleted) {
    throw new ApiError(HttpStatusCode.NotFound, 'This user is not found!', traceId);
  }

  if (!user.isSignUpOtpVerified) {
    throw new ApiError(HttpStatusCode.Forbidden, 'Your profile is not verified', traceId);
  }

  if (fcmToken) {
    await User.findByIdAndUpdate(user._id, { fcmToken, isLoginOTPVerified: false });
  }

  const otpData = await OtpServices.sendOtpViaDirectPhone(traceId, { phone });

  return {
    ...otpData,
    user: {
      _id: user._id,
      id: user.id,
      name: user.name,
      email: user.email,
      countryCode: user.countryCode,
      phone: user.phone,
      role: user.role,
      status: user.status,
      isProfileSetUp: user.isProfileSetUp,
    },
  };
};

// ─── Password ──────────────────────────────────────────────────────────────

/** Sends password reset OTP to the user's email. */
export const forgotPassword = async (
  traceId: string,
  payload: TForgotPasswordPayload
) => {
  const { email } = payload;

  const user = await User.isUserExistsByEmail(email);
  if (!user || user.isDeleted) {
    throw new ApiError(HttpStatusCode.NotFound, 'This user is not found!', traceId);
  }

  await User.findByIdAndUpdate(user._id, { isResetPasswordVerified: false });

  return OtpServices.sendOtpInEmail(traceId, user._id.toString(), email);
};

export const resetPassword = async (
  traceId: string,
  userId: string,
  payload: TResetPasswordPayload
) => {
  const { password, confirmPassword } = payload;

  if (password !== confirmPassword) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Password and Confirm Password not matched.',
      traceId
    );
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(HttpStatusCode.NotFound, 'User not found', traceId);
  }

  if (!user.isResetPasswordVerified) {
    throw new ApiError(
      HttpStatusCode.Forbidden,
      'Please complete OTP verification to reset your password.',
      traceId
    );
  }

  const newHashedPassword = await hash(password, SALT_ROUNDS);

  const updated = await User.findByIdAndUpdate(
    user._id,
    { $set: { password: newHashedPassword, passwordChangedAt: new Date() } },
    { returnDocument: 'after' }
  );

  if (!updated) {
    throw new ApiError(
      HttpStatusCode.InternalServerError,
      'Password was not reset. Please try again!',
      traceId
    );
  }
};

export const changePassword = async (
  traceId: string,
  userId: string,
  payload: TChangePasswordPayload
) => {
  const { currentPassword, password, confirmPassword } = payload;

  if (password !== confirmPassword) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'New password and confirm password do not match.',
      traceId
    );
  }

  const user = await User.findById(userId).select('+password');
  if (!user || user.isDeleted) {
    throw new ApiError(HttpStatusCode.NotFound, 'This user is not found!', traceId);
  }

  if (!(await User.isPasswordMatched(currentPassword, user.password))) {
    throw new ApiError(HttpStatusCode.Forbidden, 'Current password is incorrect.', traceId);
  }

  const newHashedPassword = await hash(password, SALT_ROUNDS);

  await User.findByIdAndUpdate(user._id, {
    $set: { password: newHashedPassword, needsPasswordChange: false, passwordChangedAt: new Date() },
  });
};

// ─── Session ───────────────────────────────────────────────────────────────

/** Logs out a user by clearing the login OTP verification state. */
export const logoutUser = async (traceId: string, userId: string) => {
  const user = await User.findById(userId);
  if (!user || user.isDeleted) {
    throw new ApiError(HttpStatusCode.NotFound, 'This user is not found!', traceId);
  }

  await User.findByIdAndUpdate(userId, { isLoginOTPVerified: false });
};

/** Issues a new access token from a valid refresh token. */
export const refreshToken = async (traceId: string, token: string) => {
  if (!token) {
    throw new ApiError(HttpStatusCode.Unauthorized, 'Refresh token is missing', traceId);
  }

  const decoded = verifyToken(token, env.JWT_REFRESH_TOKEN_SECRET_KEY as string);

  const user = await User.isUserExistsByEmail(decoded?.email);
  if (!user || user.isDeleted) {
    throw new ApiError(HttpStatusCode.NotFound, 'This user is not found!', traceId);
  }

  const accessToken = createToken(
    { userId: user._id as any, email: user.email, role: user.role },
    env.JWT_ACCESS_TOKEN_SECRET_KEY as string,
    env.JWT_ACCESS_EXPIRATION_TIME as TExpiresIn
  );

  return { accessToken };
};

export const AuthService = {
  signupWithEmail,
  signupWithPhone,
  registerWithGoogle,
  registerWithApple,
  loginWithEmail,
  loginWithPhone,
  forgotPassword,
  resetPassword,
  changePassword,
  logoutUser,
  refreshToken,
};


