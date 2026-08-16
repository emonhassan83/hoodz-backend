import { HttpStatusCode } from 'axios';
import { sign, verify, JwtPayload } from 'jsonwebtoken';

import { env } from '@/app/configs/env.configs';
import ApiError from '@/app/errors/ApiError';
import { TExpiresIn, TJwtPayload } from '@/app/modules/auth/auth.types';
import { USER_ROLE, USER_STATUS } from '@/app/modules/user/user.constant';
import {
  checkUserExists,
  buildGeoLocation,
  createUser,
  restoreUser,
  updateUnverifiedUser,
  validateUserCreation,
} from '@/app/modules/user/user.helpers';
import { ISignUpWithEmail, IUser } from '@/app/modules/user/user.interface';
import { User } from '@/app/modules/user/user.model';

// ─── JWT ───────────────────────────────────────────────────────────────────

export const createToken = (
  jwtPayload: TJwtPayload,
  secret: string,
  expiresIn: TExpiresIn
) => sign(jwtPayload, secret, { expiresIn });

export const verifyToken = (token: string, secret: string) =>
  verify(token, secret) as JwtPayload;

// Single definition — otp.helpers was using generateAuthTokens (same logic, now removed)
export const generateTokens = (user: IUser) => {
  const jwtPayload = { userId: user._id, email: user.email, role: user.role };

  const userResponse = {
    name: user.name,
    email: user.email,
    countryCode: user.countryCode,
    phone: user.phone,
    profileAvatar: user.profileAvatar,
    role: user.role,
    status: user.status,
    registerWith: user.registerWith,
    isProfileSetUp: user.isProfileSetUp
  };

  const accessToken = createToken(
    jwtPayload,
    env.JWT_ACCESS_TOKEN_SECRET_KEY as string,
    env.JWT_ACCESS_EXPIRATION_TIME as TExpiresIn
  );

  const refreshToken = createToken(
    jwtPayload,
    env.JWT_REFRESH_TOKEN_SECRET_KEY as string,
    env.JWT_REFRESH_EXPIRATION_TIME as TExpiresIn
  );

  return { user: userResponse, accessToken, refreshToken };
};

/** Converts flat signup coordinates into persisted GeoJSON location fields. */
export const buildSignupAddressPayload = <T extends Partial<ISignUpWithEmail>>(
  payload: T
) => {
  const {
    latitude,
    longitude,
    deliveryLatitude,
    deliveryLongitude,
    referralCode: _referralCode,
    ...rest
  } = payload;

  return {
    ...rest,
    ...(typeof latitude === 'number' && typeof longitude === 'number'
      ? { location: buildGeoLocation(longitude, latitude) }
      : {}),
    ...(typeof deliveryLatitude === 'number' &&
    typeof deliveryLongitude === 'number'
      ? {
          deliveryLocation: buildGeoLocation(
            deliveryLongitude,
            deliveryLatitude
          ),
        }
      : {}),
  };
};

export const resolveReferralData = async (
  referralCode: string | undefined,
  traceId: string,
  currentUserId?: string
) => {
  if (!referralCode) return {};

  const normalizedReferralCode = referralCode.trim().toUpperCase();
  const referrer = await User.findOne({
    referralCode: normalizedReferralCode,
    isDeleted: false,
  })
    .select('_id referralCode')
    .lean();

  if (!referrer) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Invalid referral code', traceId);
  }

  if (currentUserId && referrer._id.toString() === currentUserId) {
    throw new ApiError(HttpStatusCode.BadRequest, 'You cannot use your own referral code', traceId);
  }

  return {
    referredBy: referrer._id,
    referralCodeUsed: referrer.referralCode,
  };
};

// ─── Signup orchestration ──────────────────────────────────────────────────

// S (SRP): processSignup owns the "create or return existing user" decision only.
// Token generation, OTP sending — handled by callers (auth.services.ts).
export const handleDuplicateUser = async (
  email: string | undefined,
  phone: string | undefined,
  payload: Partial<ISignUpWithEmail>,
  traceId: string
) => {
  const role = payload.role ?? USER_ROLE.user;
  if (![USER_ROLE.user, USER_ROLE.rider].includes(role as any)) {
    throw new ApiError(
      HttpStatusCode.Forbidden,
      'Only user and rider can register directly',
      traceId
    );
  }

  const identityPayload = {
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
  };

  const existingUser = await checkUserExists(email, phone);
  const referralData = await resolveReferralData(
    payload.referralCode,
    traceId,
    existingUser?._id.toString()
  );

  const nextPayload = {
    ...buildSignupAddressPayload(payload),
    ...referralData,
    role,
    status: role === USER_ROLE.rider ? USER_STATUS.pending : USER_STATUS.active,
  };

  if (!existingUser) {
    return { shouldProceed: true };
  }

  if (!existingUser.isDeleted && existingUser.isSignUpOtpVerified) {
    const message =
      email && existingUser.email === email
        ? 'User already exists with this email'
        : 'User already exists with this phone number';

    throw new ApiError(HttpStatusCode.Conflict, message, traceId);
  }

  if (existingUser.isDeleted) {
    await restoreUser(
      existingUser._id.toString(),
      { ...identityPayload, ...nextPayload },
      traceId
    );
  } else {
    await updateUnverifiedUser(
      existingUser._id.toString(),
      { ...identityPayload, ...nextPayload },
      traceId
    );
  }

  return { shouldProceed: true };
};

export const processSignup = async (
  payload: ISignUpWithEmail,
  traceId: string
) => {
  const { email } = payload;
  const fallbackName = email.split('@')[0] || 'Hoodz User';
  const role = payload.role ?? USER_ROLE.user;
  if (![USER_ROLE.user, USER_ROLE.rider].includes(role as any)) {
    throw new ApiError(
      HttpStatusCode.Forbidden,
      'Only user and rider can register directly',
      traceId
    );
  }

  const existingUser = await checkUserExists(email);
  const referralData = await resolveReferralData(
    payload.referralCode,
    traceId,
    existingUser?._id.toString()
  );

  const signupPayload = {
    ...buildSignupAddressPayload(payload),
    ...referralData,
    name: payload.name?.trim() || fallbackName,
    role,
    status: role === USER_ROLE.rider ? USER_STATUS.pending : USER_STATUS.active,
  };

  if (existingUser) {
    if (!existingUser.isDeleted && existingUser.isSignUpOtpVerified) {
      const message =
        email && existingUser.email === email
          ? 'User already exists with this email'
          : 'User already exists with this phone number';
      throw new ApiError(HttpStatusCode.Conflict, message, traceId);
    }

    // Soft-deleted → restore; unverified → update fields
    if (existingUser.isDeleted) {
      return restoreUser(existingUser._id.toString(), signupPayload, traceId);
    }

    return updateUnverifiedUser(existingUser._id.toString(), signupPayload, traceId);
  }

  const user = await createUser(signupPayload);
  validateUserCreation(user, traceId);
  return user;
};

