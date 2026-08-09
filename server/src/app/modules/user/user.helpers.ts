import crypto from 'node:crypto';

import axios, { HttpStatusCode } from 'axios';

import { env } from '@/app/configs/env.configs';
import ApiError from '@/app/errors/ApiError';
import { NOTIFICATION_MODEL_TYPE } from '@/app/modules/notification/notification.constant';
import {
  ISignUpWithEmail,
  IGeoLocation,
  IUser,
} from '@/app/modules/user/user.interface';
import { User } from '@/app/modules/user/user.model';
import {
  TCoordinate,
  TPlatformInviteEmailJobName,
  TPlatformInviteEmailPayload,
} from '@/app/modules/user/user.types';
import { sendBothNotificationViaQueue } from '@/app/utils/notification-queue.service';
import { getEmailQueueInstance } from '@/app/utils/queueHelper';

// ─── Lean lookups — no throw, callers decide ───────────────────────────────

export const findUserById = async (userId: string) =>
  User.findById(userId).lean();

export const findUserByEmail = async (email: string) =>
  User.findOne({ email }).lean();

export const findUserByPhone = async (phone: string) =>
  User.findOne({ phone }).lean();

export const checkUserExists = async (email?: string, phone?: string) => {
  const conditions: Record<string, string>[] = [];

  if (email) conditions.push({ email });
  if (phone) conditions.push({ phone });

  if (conditions.length === 0) return null;

  return User.findOne({ $or: conditions }).lean();
};

// ─── Mutations ─────────────────────────────────────────────────────────────

export const createUser = async (payload: ISignUpWithEmail) =>
  User.create(payload);

export const updateUser = async (userId: string, data: Record<string, any>) =>
  User.findByIdAndUpdate(userId, data, { new: true });

export const softDeleteUser = async (userId: string) =>
  User.findByIdAndUpdate(userId, { isDeleted: true }, { new: true });

export const restoreUser = async (
  userId: string,
  data: Record<string, any>,
  traceId?: string
) => {
  const user = await User.findById(userId);
  if (!user)
    throw new ApiError(HttpStatusCode.NotFound, 'User not found', traceId);
  user.set({ ...data, isDeleted: false });
  await user.save();
  return user;
};

export const updateUnverifiedUser = async (
  userId: string,
  data: Record<string, any>,
  traceId?: string
) => {
  const user = await User.findById(userId);
  if (!user)
    throw new ApiError(HttpStatusCode.NotFound, 'User not found', traceId);
  user.set(data);
  await user.save();
  return user;
};

// ─── Validators — throw on violation ───────────────────────────────────────

// Single definition — was duplicated in auth.helpers and otp.helpers
export const validateUserExists = (user: any, traceId?: string): void => {
  if (!user || user.isDeleted) {
    throw new ApiError(HttpStatusCode.NotFound, 'User not found', traceId);
  }
};

export const validateUserCreation = (user: any, traceId?: string): void => {
  if (!user) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'User creation failed',
      traceId
    );
  }
};

// Throws if user not found or soft-deleted — used inside service functions
export const findActiveUserOrThrow = async (
  userId: string,
  traceId?: string
) => {
  const user = await User.findById(userId);
  if (!user || user.isDeleted) {
    throw new ApiError(HttpStatusCode.NotFound, 'User not found', traceId);
  }
  return user;
};

export const assertEmailNotTaken = async (
  email: string,
  excludeUserId: string,
  traceId?: string
) => {
  const exists = await User.findOne({ email, _id: { $ne: excludeUserId } });
  if (exists) {
    throw new ApiError(
      HttpStatusCode.Conflict,
      'This email is already in use by another account',
      traceId
    );
  }
};

export const assertPhoneNotTaken = async (
  phone: string,
  excludeUserId: string,
  traceId?: string
) => {
  const exists = await User.findOne({ phone, _id: { $ne: excludeUserId } });
  if (exists) {
    throw new ApiError(
      HttpStatusCode.Conflict,
      'This phone number is already in use',
      traceId
    );
  }
};

// ─── Pure utils ────────────────────────────────────────────────────────────

export const buildGeoLocation = (
  longitude: number,
  latitude: number
): IGeoLocation => ({
  type: 'Point',
  coordinates: [longitude, latitude],
});

export const calculateDistanceKm = (
  origin: TCoordinate,
  destination: TCoordinate
) => {
  const earthRadiusKm = 6371;
  const toRadians = (degree: number) => (degree * Math.PI) / 180;
  const dLat = toRadians(destination.latitude - origin.latitude);
  const dLon = toRadians(destination.longitude - origin.longitude);
  const lat1 = toRadians(origin.latitude);
  const lat2 = toRadians(destination.latitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const getGoogleDistanceMatrix = async (
  origin: TCoordinate,
  destinations: TCoordinate[]
) => {
  if (destinations.length === 0) return [];

  const response = await axios.get(
    'https://maps.googleapis.com/maps/api/distancematrix/json',
    {
      params: {
        origins: `${origin.latitude},${origin.longitude}`,
        destinations: destinations
          .map((destination) => `${destination.latitude},${destination.longitude}`)
          .join('|'),
        mode: 'driving',
        units: 'metric',
        key: env.GOOGLE_MAPS_API_KEY,
      },
      timeout: 8000,
    }
  );

  if (response.data?.status !== 'OK') {
    throw new Error(response.data?.error_message || 'Google Maps request failed');
  }

  return response.data.rows?.[0]?.elements ?? [];
};

export const generateTemporaryPassword = () => {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const numbers = '23456789';
  const symbols = '@#$%';
  const all = `${upper}${lower}${numbers}${symbols}`;

  const required = [
    upper[crypto.randomInt(upper.length)],
    lower[crypto.randomInt(lower.length)],
    numbers[crypto.randomInt(numbers.length)],
    symbols[crypto.randomInt(symbols.length)],
  ];

  while (required.length < 8) {
    required.push(all[crypto.randomInt(all.length)]);
  }

  return required.sort(() => crypto.randomInt(3) - 1).join('');
};

export const enqueuePlatformInviteEmail = async (
  emailJobName: TPlatformInviteEmailJobName,
  payload: TPlatformInviteEmailPayload
) => {
  const emailQueue = await getEmailQueueInstance();

  await emailQueue.add(
    emailJobName,
    {
      ...payload,
      dashboardUrl: env.DASHBOARD_URL,
    },
    { priority: 1, attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
  );
};

// ─── Firebase Push Notification Helpers ──────────────────────────────────────

/**
 * Update User FCM Token
 * Single Responsibility: Update user's Firebase Cloud Messaging token
 */
export const updateUserFcmToken = async (userId: string, fcmToken: string) => {
  return User.findByIdAndUpdate(userId, { fcmToken }, { new: true });
};

/**
 * Get User FCM Token
 * Single Responsibility: Get user's FCM token for push notifications
 */
export const getUserFcmToken = async (
  userId: string
): Promise<string | null> => {
  const user = await User.findById(userId).select('fcmToken').lean();
  return user?.fcmToken || null;
};

export const sendUserStatusNotifYToUser = async (
  status: 'active' | 'blocked' | 'pending',
  user: IUser
) => {
  if (!user || !user?._id || !user?.fcmToken) return;

  let message: string;
  let description: string;

  if (status === 'active') {
    message = '✅ Account Activated';
    description =
      'Your account has been successfully activated. You can now access all available features.';
  } else if (status === 'blocked') {
    message = '🚫 Account Blocked';
    description =
      'Your account has been blocked. Please contact support for further assistance.';
  } else {
    message = '⏳ Account Status Updated';
    description = 'Your account status has been updated.';
  }

  // Send notification via queue (async, non-blocking)
  await sendBothNotificationViaQueue(
    user._id.toString(),
    user.fcmToken,
    message,
    description,
    {
      modelType: NOTIFICATION_MODEL_TYPE.User,
      reference: user._id.toString(),
    }
  );
};


