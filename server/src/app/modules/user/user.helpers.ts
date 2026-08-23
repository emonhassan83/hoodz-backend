import crypto from 'node:crypto';

import axios, { HttpStatusCode } from 'axios';
import mongoose from 'mongoose';

import { env } from '@/app/configs/env.configs';
import ApiError from '@/app/errors/ApiError';
import { NOTIFICATION_MODEL_TYPE } from '@/app/modules/notification/notification.constant';
import { Product } from '@/app/modules/product/product.model';
import { Setting } from '@/app/modules/settings/settings.model';
import { upsertShopToTypesense } from '@/app/modules/search/search.typesense';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import {
  ISignUpWithEmail,
  IGeoLocation,
  IUser,
  IUserDeliveryAddress,
} from '@/app/modules/user/user.interface';
import { User } from '@/app/modules/user/user.model';
import {
  TCoordinate,
  TGoogleDistanceElement,
  TInvitePlatformUserPayload,
  TPlatformInviteEmailJobName,
  TPlatformInviteEmailPayload,
  TUpdateDeliveryLocationPayload,
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

export const getUserDeliveryCoordinates = (user?: {
  deliveryAddress?: { location?: IGeoLocation | null } | null;
  location?: IGeoLocation | null;
} | null) => {
  const deliveryCoords = user?.deliveryAddress?.location?.coordinates;
  if (deliveryCoords?.some((coordinate) => coordinate !== 0)) {
    return deliveryCoords;
  }
  const locationCoords = user?.location?.coordinates;
  if (locationCoords?.some((coordinate) => coordinate !== 0)) {
    return locationCoords;
  }
  return null;
};

export const assertDeliveryCityAllowed = async (
  traceId: string,
  city: string
) => {
  const setting = await Setting.findOne({
    key: 'deliveryCharge',
    vendor: null,
  }).lean();
  const deliveryCharges = Array.isArray(setting?.value) ? setting.value : [];
  const matched = deliveryCharges.some(
    (item: { state?: string }) =>
      item.state?.toLowerCase() === city.trim().toLowerCase()
  );
  if (!matched) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Delivery is not available for this city',
      traceId
    );
  }
};

export const normalizeDeliveryAddress = async (
  traceId: string,
  payload: TUpdateDeliveryLocationPayload
): Promise<IUserDeliveryAddress> => {
  const [longitude, latitude] = payload.location.coordinates;
  await assertDeliveryCityAllowed(traceId, payload.city);

  return {
    name: payload.name.trim(),
    location: buildGeoLocation(longitude, latitude),
    buildingNo: payload.buildingNo ?? null,
    floorNo: payload.floorNo ?? null,
    apartment: payload.apartment ?? null,
    city: payload.city.trim(),
    country: payload.country.trim(),
  };
};

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

export const toFiniteNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const getNearbyShopGoogleElements = async (
  origin: TCoordinate,
  destinations: TCoordinate[]
) => {
  const googleDestinationLimit = 25;
  const googleElements: TGoogleDistanceElement[] = [];
  try {
    for (let i = 0; i < destinations.length; i += googleDestinationLimit) {
      const chunk = destinations.slice(i, i + googleDestinationLimit);
      const elements = await getGoogleDistanceMatrix(origin, chunk);
      googleElements.push(...elements);
    }
  } catch (error) {
    console.warn(
      '[Nearby Shops] Google Maps distance lookup failed:',
      error instanceof Error ? error.message : error
    );
  }
  return googleElements;
};

export const resolveShopViewerOrigin = async (
  query: {
    latitude?: number;
    longitude?: number;
    lat?: number;
    lng?: number;
    lang?: number;
  },
  userId?: string
): Promise<TCoordinate | null> => {
  const queryLatitude = toFiniteNumber(query.latitude ?? query.lat);
  const queryLongitude = toFiniteNumber(query.longitude ?? query.lng ?? query.lang);
  let origin =
    queryLatitude !== undefined && queryLongitude !== undefined
      ? { latitude: queryLatitude, longitude: queryLongitude }
      : null;

  if (!origin && userId) {
    const user = await User.findById(userId)
      .select('deliveryAddress location')
      .lean();
    const coordinates = getUserDeliveryCoordinates(user);

    if (coordinates && coordinates.some((coordinate) => coordinate !== 0)) {
      origin = { longitude: coordinates[0], latitude: coordinates[1] };
    }
  }

  return origin;
};

export const resolveShopDistance = async (
  origin: TCoordinate,
  destination: TCoordinate
) => {
  try {
    const [element] = await getGoogleDistanceMatrix(origin, [destination]);
    const fallbackDistanceKm = Number(
      calculateDistanceKm(origin, destination).toFixed(2)
    );
    const googleDistanceKm =
      element?.status === 'OK' && element.distance?.value !== undefined
        ? element.distance.value / 1000
        : fallbackDistanceKm;
    return {
      distanceKm: Number(Math.max(googleDistanceKm, 0.01).toFixed(2)),
      durationMinutes:
        element?.status === 'OK' && element.duration?.value !== undefined
          ? Math.ceil(element.duration.value / 60)
          : null,
    };
  } catch {
    const fallbackDistanceKm = Number(
      calculateDistanceKm(origin, destination).toFixed(2)
    );
    return {
      distanceKm: Number(Math.max(fallbackDistanceKm, 0.01).toFixed(2)),
      durationMinutes: null,
    };
  }
};

export const getShopProductCategories = (vendorId: string) =>
  Product.aggregate([
    { $match: { vendor: new mongoose.Types.ObjectId(vendorId), isDeleted: false } },
    { $group: { _id: '$category', productCount: { $sum: 1 } } },
    {
      $lookup: {
        from: 'categories',
        localField: '_id',
        foreignField: '_id',
        as: 'category',
      },
    },
    { $unwind: '$category' },
    {
      $project: {
        _id: '$category._id',
        title: '$category.title',
      },
    },
    { $sort: { productCount: -1, title: 1 } },
  ]);

export const createInvitedPlatformUser = async (
  traceId: string,
  payload: TInvitePlatformUserPayload,
  role: typeof USER_ROLE.vendor | typeof USER_ROLE.agent,
  emailJobName: TPlatformInviteEmailJobName
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

  await enqueuePlatformInviteEmail(emailJobName, {
    email: payload.email,
    name: payload.name,
    password,
  });

  if (role === USER_ROLE.vendor) {
    await upsertShopToTypesense(user._id.toString()).catch((error) => {
      console.warn(
        '[Typesense] Vendor invite sync failed:',
        error instanceof Error ? error.message : error
      );
    });
  }

  return user;
};


