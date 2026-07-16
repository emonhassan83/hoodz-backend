import { HttpStatusCode } from 'axios';
import { hash } from 'bcrypt';
import mongoose from 'mongoose';

import QueryBuilder from '@/app/builder/QueryBuilder';
import { SALT_ROUNDS } from '@/app/constant';
import ApiError from '@/app/errors/ApiError';
import { generateTokens } from '@/app/modules/auth/auth.helpers';
import { IUserStatus, USER_ROLE } from '@/app/modules/user/user.constant';
import {
  assertEmailNotTaken,
  assertPhoneNotTaken,
  buildGeoLocation,
  enqueuePlatformInviteEmail,
  findActiveUserOrThrow,
  generateTemporaryPassword,
  sendUserStatusNotifYToUser,
} from '@/app/modules/user/user.helpers';
import { IUser } from '@/app/modules/user/user.interface';
import { User } from '@/app/modules/user/user.model';

// ─── Read ──────────────────────────────────────────────────────────────────

const getAllUsersFromDB = async (
  _traceId: string,
  query: Record<string, unknown>
) => {
  const usersQuery = new QueryBuilder(
    User.find({ isDeleted: false, role: { $ne: USER_ROLE.admin } }).select(
      '_id id name email profileAvatar role address deliveryAddress deliveryZone status isProfileSetUp createdAt'
    ),
    query
  )
    .search(['name'])
    .filter()
    .sort()
    .paginate()
    .fields();

  const [users, meta] = await Promise.all([
    usersQuery.modelQuery,
    usersQuery.countTotal(),
  ]);

  return { meta, users };
};

const getSingleUser = async (traceId: string, userId: string) => {
  const user = await User.findById(userId)
    .select('-password -expireAt -updatedAt -__v')
    .lean();
  if (!user || user.isDeleted) {
    throw new ApiError(HttpStatusCode.NotFound, 'User not found', traceId);
  }
  return user;
};

// ─── Update ────────────────────────────────────────────────────────────────

const changeEmail = async (
  traceId: string,
  userId: string,
  payload: { email: string }
) => {
  const { email: newEmail } = payload;

  const user = await findActiveUserOrThrow(userId, traceId);

  if (!user.isChangeEmailOtpVerified) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Please verify OTP first',
      traceId
    );
  }

  await assertEmailNotTaken(newEmail, userId, traceId);

  user.email = newEmail;
  user.isChangeEmailOtpVerified = false;
  await user.save();

  return generateTokens(user as any);
};

const updateUserProfile = async (
  traceId: string,
  userId: string,
  payload: Partial<IUser> & { latitude?: number; longitude?: number }
): Promise<Partial<IUser>> => {
  await findActiveUserOrThrow(userId, traceId);

  const updateData: Record<string, any> = { ...payload };

  if (payload.latitude && payload.longitude) {
    updateData.location = buildGeoLocation(payload.longitude, payload.latitude);
    delete updateData.latitude;
    delete updateData.longitude;
  }

  if (payload.phone) {
    const user = await User.findById(userId);
    if (payload.phone !== user?.phone) {
      if (!user?.isChangePhoneOtpVerified) {
        throw new ApiError(
          HttpStatusCode.BadRequest,
          'Please verify your new phone with OTP first',
          traceId
        );
      }
      await assertPhoneNotTaken(payload.phone, userId, traceId);
      updateData.isChangePhoneOtpVerified = false;
    }
  }

  const result = await User.findByIdAndUpdate(
    userId,
    { ...updateData, isProfileSetUp: true },
    { returnDocument: 'after' }
  )
    .select('-password -expireAt -createdAt -updatedAt')
    .lean();

  if (!result)
    throw new ApiError(HttpStatusCode.NotFound, 'User not found', traceId);
  return result;
};

const updateUserStatus = async (
  traceId: string,
  userId: string,
  payload: { status: IUserStatus }
): Promise<IUser | null> => {
  await findActiveUserOrThrow(userId, traceId);

  const result = await User.findByIdAndUpdate(
    userId,
    { status: payload.status },
    { returnDocument: 'after' }
  ).select('name fcmToken email phone status isDeleted');

  if (!result)
    throw new ApiError(HttpStatusCode.NotFound, 'User not found', traceId);

  // Send notification via queue (async, non-blocking)
  await sendUserStatusNotifYToUser(payload.status, result);

  return result;
};

const updateLocationFromDB = async (
  traceId: string,
  userId: string,
  payload: {
    longitude: number;
    latitude: number;
    address: string;
    timeZone?: string;
  }
) => {
  const { longitude, latitude, address, timeZone } = payload;

  await findActiveUserOrThrow(userId, traceId);

  return User.findByIdAndUpdate(
    userId,
    {
      location: buildGeoLocation(longitude, latitude),
      address,
      ...(timeZone ? { timeZone } : {}),
    },
    { returnDocument: 'after' }
  );
};

const updateDeliveryLocationFromDB = async (
  traceId: string,
  userId: string,
  payload: {
    longitude: number;
    latitude: number;
    deliveryAddress: string;
  }
) => {
  const { longitude, latitude, deliveryAddress } = payload;

  await findActiveUserOrThrow(userId, traceId);

  return User.findByIdAndUpdate(
    userId,
    {
      deliveryLocation: buildGeoLocation(longitude, latitude),
      deliveryAddress,
    },
    { returnDocument: 'after' }
  );
};

const setOrUpdateSecurityCode = async (
  traceId: string,
  userId: string,
  payload: { password: string; securityCode: string }
) => {
  const user = await User.findById(userId).select('+password +securityCode');

  if (!user || user.isDeleted) {
    throw new ApiError(HttpStatusCode.NotFound, 'User not found', traceId);
  }

  if (user.role !== USER_ROLE.rider) {
    throw new ApiError(
      HttpStatusCode.Forbidden,
      'Only riders can set a security code',
      traceId
    );
  }

  if (!user.password) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Password login is required to set a security code',
      traceId
    );
  }

  const isPasswordMatched = await User.isPasswordMatched(
    payload.password,
    user.password
  );
  if (!isPasswordMatched) {
    throw new ApiError(HttpStatusCode.Forbidden, 'Password is incorrect', traceId);
  }

  const hashedSecurityCode = await hash(payload.securityCode, SALT_ROUNDS);
  await User.findByIdAndUpdate(userId, { securityCode: hashedSecurityCode });

  return { securityCodeSet: true };
};

const verifySecurityCode = async (
  traceId: string,
  userId: string,
  payload: { securityCode: string }
) => {
  const user = await User.findById(userId).select('+securityCode');

  if (!user || user.isDeleted) {
    throw new ApiError(HttpStatusCode.NotFound, 'User not found', traceId);
  }

  if (user.role !== USER_ROLE.rider) {
    throw new ApiError(
      HttpStatusCode.Forbidden,
      'Only riders can verify a security code',
      traceId
    );
  }

  if (!user.securityCode) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Security code has not been set',
      traceId
    );
  }

  const isMatched = await User.isSecurityCodeMatched(
    payload.securityCode,
    user.securityCode
  );
  if (!isMatched) {
    throw new ApiError(
      HttpStatusCode.Forbidden,
      'Security code is incorrect',
      traceId
    );
  }

  return { verified: true };
};

type TInvitePlatformUserPayload = {
  name: string;
  email: string;
  countryCode: string;
  phone: string;
};

const createInvitedPlatformUser = async (
  traceId: string,
  payload: TInvitePlatformUserPayload,
  role: typeof USER_ROLE.vendor | typeof USER_ROLE.agent,
  emailJobName: 'send-vendor-invite-email' | 'send-agent-invite-email'
) => {
  const exists = await User.findOne({
    $or: [{ email: payload.email }, { phone: payload.phone }],
  });
  if (exists) {
    throw new ApiError(
      HttpStatusCode.Conflict,
      'A user with this email or phone already exists',
      traceId
    );
  }

  const password = generateTemporaryPassword();
  const user = await User.create({
    ...payload,
    role,
    password,
    isLegalTermsAccepted: true,
    isSignUpOtpVerified: true,
    isProfileSetUp: false,
    needsPasswordChange: true,
    expireAt: null as unknown as Date,
  });

  await enqueuePlatformInviteEmail(
    emailJobName,
    {
      email: payload.email,
      name: payload.name,
      password,
    }
  );

  return user;
};

const inviteVendor = async (
  traceId: string,
  payload: TInvitePlatformUserPayload
) =>
  createInvitedPlatformUser(
    traceId,
    payload,
    USER_ROLE.vendor,
    'send-vendor-invite-email'
  );

const inviteAgent = async (
  traceId: string,
  payload: TInvitePlatformUserPayload
) =>
  createInvitedPlatformUser(
    traceId,
    payload,
    USER_ROLE.agent,
    'send-agent-invite-email'
  );

// ─── Delete ────────────────────────────────────────────────────────────────

const deleteUserProfile = async (
  traceId: string,
  userId: string
): Promise<IUser | null> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await User.findById(userId).session(session);
    if (!user || user.isDeleted) {
      throw new ApiError(HttpStatusCode.NotFound, 'User not found', traceId);
    }

    const deletedUser = await User.findByIdAndUpdate(
      userId,
      { isDeleted: true, deletedAt: new Date() },
      {
        returnDocument: 'after',
        session,
        select: 'name email phone status isDeleted deletedAt',
      }
    );

    if (!deletedUser) {
      throw new ApiError(
        HttpStatusCode.InternalServerError,
        'Failed to delete user',
        traceId
      );
    }

    await session.commitTransaction();
    return deletedUser;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

export const UserService = {
  getAllUsersFromDB,
  getSingleUser,
  changeEmail,
  updateUserProfile,
  updateUserStatus,
  updateLocationFromDB,
  updateDeliveryLocationFromDB,
  setOrUpdateSecurityCode,
  verifySecurityCode,
  inviteVendor,
  inviteAgent,
  deleteUserProfile,
};
