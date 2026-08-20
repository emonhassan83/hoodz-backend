import { compare, hash } from 'bcrypt';
import { HttpStatusCode } from 'axios';
import { Secret, sign, verify } from 'jsonwebtoken';
import twilio from 'twilio';

import { env } from '@/app/configs/env.configs';
import ApiError from '@/app/errors/ApiError';
import { getRedisClient } from '@/app/configs/redis.config';
import {
  DELIVERY_OTP_TTL_SECONDS,
  JOB_MATCH_RADIUS_KM,
  JOB_PAYMENT_METHOD,
  JOB_STATUS,
  RIDER_MATCH_DEFAULTS,
} from '@/app/modules/job/job.constant';
import { IJob } from '@/app/modules/job/job.interface';
import { Job } from '@/app/modules/job/job.model';
import { Orders } from '@/app/modules/orders/orders.model';
import { REDIS_KEYS } from '@/app/redis/keys';
import { KYC_STATUS } from '@/app/modules/kyc/kyc.constant';
import { Kyc } from '@/app/modules/kyc/kyc.model';
import { USER_ROLE, USER_STATUS } from '@/app/modules/user/user.constant';
import { User } from '@/app/modules/user/user.model';
import { SettingService } from '@/app/modules/settings/settings.services';
import { NOTIFICATION_MODEL_TYPE } from '@/app/modules/notification/notification.constant';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import { RiderAvailabilitySocketHelper } from '@/app/socket/utils/riderAvailability.helpers';
import { sendBatchNotificationViaQueue } from '@/app/utils/notification-queue.service';
import mongoose from 'mongoose';

/** Returns a random 6-digit delivery OTP. */
export const generateDeliveryOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

/** Hashes delivery OTP before storing it. */
export const hashDeliveryOtp = async (otp: string) => hash(otp, 10);

/** Compares delivery OTP with stored hash. */
export const compareDeliveryOtp = async (otp: string, hashedOtp: string) =>
  compare(otp, hashedOtp);

/** Stores delivery OTP hash in Redis for 6 minutes. */
export const saveDeliveryOtpToRedis = async (
  jobId: string,
  hashedOtp: string,
  ttlSeconds = DELIVERY_OTP_TTL_SECONDS
) => {
  await getRedisClient().set(REDIS_KEYS.DELIVERY_OTP(jobId), hashedOtp, 'EX', ttlSeconds);
};

/** Short-lived token returned with send-delivery-otp. */
export const createDeliveryOtpToken = (jobId: string) =>
  sign(
    { jobId, type: 'delivery_otp' },
    env.JWT_VERIFY_OTP_SECRET_KEY as Secret,
    { expiresIn: `${DELIVERY_OTP_TTL_SECONDS}s` }
  );

/** Decodes a delivery OTP verification token. */
export const verifyDeliveryOtpToken = (token: string | undefined, traceId: string) => {
  if (!token?.trim()) {
    throw new ApiError(
      HttpStatusCode.Unauthorized,
      'OTP verification token is required',
      traceId
    );
  }

  try {
    return verify(token.trim(), env.JWT_VERIFY_OTP_SECRET_KEY as Secret) as {
      jobId: string;
      type?: string;
    };
  } catch {
    throw new ApiError(
      HttpStatusCode.Forbidden,
      'OTP verification token has expired. Please request a new OTP.',
      traceId
    );
  }
};

/** Resolves the customer phone used for delivery OTP SMS. */
export const getCustomerDeliveryPhone = (order: any) =>
  order?.billingDetails?.phoneNumber || order?.user?.phone || null;

/** Reads delivery OTP hash from Redis. */
export const getDeliveryOtpFromRedis = async (jobId: string) =>
  getRedisClient().get(REDIS_KEYS.DELIVERY_OTP(jobId));

/** Deletes delivery OTP hash after successful verification. */
export const deleteDeliveryOtpFromRedis = async (jobId: string) => {
  await getRedisClient().del(REDIS_KEYS.DELIVERY_OTP(jobId));
};

/** Sends delivery OTP to customer phone in production and mocks locally. */
export const sendDeliveryOtpSms = async (
  traceId: string,
  phoneNumber: string | null | undefined,
  otp: string
) => {
  const mock = env.NODE_ENV !== 'production';
  if (mock) return { sent: false, mock };

  if (!phoneNumber) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Customer phone number is required to send delivery OTP',
      traceId
    );
  }

  const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  try {
    await client.messages.create({
      body: `Your Hoodz delivery OTP is ${otp}. It expires in 6 minutes. Please do not share it.`,
      from: env.TWILIO_PHONE_NUMBER,
      to: phoneNumber,
    });
    return { sent: true, mock };
  } catch (error) {
    console.error(`[${traceId}] Delivery OTP SMS error:`, error);
    throw new ApiError(
      HttpStatusCode.InternalServerError,
      'Failed to send delivery OTP',
      traceId
    );
  }
};

/** Throws unless requester can manage an order assignment. */
export const assertCanAssignOrder = (
  traceId: string,
  order: { author: unknown },
  requester: { userId: string; role: string }
) => {
  const isAdmin = requester.role === USER_ROLE.admin;
  const isAgent = requester.role === USER_ROLE.agent;
  const isVendorOwner =
    String((order.author as any)?._id ?? order.author) === requester.userId;

  if (!isAdmin && !isAgent && !isVendorOwner) {
    throw new ApiError(HttpStatusCode.Forbidden, 'You cannot assign this order', traceId);
  }
};

/** Throws unless requester can access a job. */
export const assertJobAccess = async (
  traceId: string,
  job: Pick<IJob, 'rider' | 'assignedBy' | 'order' | 'requestedRider'>,
  requester: { userId: string; role: string }
) => {
  const userId = requester.userId;
  const orderId = String((job.order as any)?._id ?? job.order);
  const isVendorOrder =
    requester.role === USER_ROLE.vendor &&
    Boolean(await Orders.exists({ _id: orderId, author: userId }));
  const isRequestedRider = (job.requestedRider ?? []).some(
    (rider) => String((rider as any)?._id ?? rider) === userId
  );
  const canAccess =
    requester.role === USER_ROLE.admin ||
    requester.role === USER_ROLE.agent ||
    isRequestedRider ||
    String((job.rider as any)?._id ?? job.rider) === userId ||
    String((job.assignedBy as any)?._id ?? job.assignedBy) === userId ||
    isVendorOrder;

  if (!canAccess) {
    throw new ApiError(HttpStatusCode.Forbidden, 'You cannot access this job', traceId);
  }
};

/** Throws unless requester is the assigned rider. */
export const assertAssignedRider = (
  traceId: string,
  job: Pick<IJob, 'rider'>,
  riderId: string
) => {
  if (!job.rider || job.rider.toString() !== riderId) {
    throw new ApiError(HttpStatusCode.Forbidden, 'This job is not assigned to you', traceId);
  }
};

/** Allows assigned rider, or a requested rider while the job is still unmatched. */
export const assertRequestedOrAssignedRider = (
  traceId: string,
  job: Pick<IJob, 'rider' | 'requestedRider'>,
  riderId: string
) => {
  if (job.rider) {
    assertAssignedRider(traceId, job, riderId);
    return;
  }

  const isRequested = (job.requestedRider ?? []).some(
    (rider) => rider.toString() === riderId
  );
  if (!isRequested) {
    throw new ApiError(HttpStatusCode.Forbidden, 'This job is not offered to you', traceId);
  }
};

/** Ensures status transition starts from one of the allowed statuses. */
export const assertJobStatusIn = (
  traceId: string,
  job: Pick<IJob, 'status'>,
  allowedStatuses: string[],
  message = 'Invalid job status transition'
) => {
  if (!allowedStatuses.includes(job.status)) {
    throw new ApiError(HttpStatusCode.BadRequest, message, traceId);
  }
};

/** Loads an order for job assignment. */
export const getAssignableOrderOrThrow = async (
  traceId: string,
  orderId: string
) => {
  const order = await Orders.findOne({ _id: orderId, isDeleted: false })
    .populate([{ path: 'author', select: 'name address location' }])
    .populate([
      {
        path: 'user',
        select: 'name email phone deliveryLocation location deliveryAddress address',
      },
    ]);
  if (!order) {
    throw new ApiError(HttpStatusCode.NotFound, 'Order not found', traceId);
  }
  return order;
};

/** Loads and validates rider user for assignment. */
export const getAssignableRiderOrThrow = async (
  traceId: string,
  riderId: string
) => {
  const [rider, kyc] = await Promise.all([
    User.findOne({
      _id: riderId,
      role: USER_ROLE.rider,
      isDeleted: false,
    }).select('status isOnline'),
    Kyc.findOne({ user: riderId }).select('status').lean(),
  ]);
  if (!rider) {
    throw new ApiError(HttpStatusCode.NotFound, 'Rider not found', traceId);
  }
  if (rider.status !== USER_STATUS.active) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Rider is not active', traceId);
  }
  if (!rider.isOnline) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Rider is not online',
      traceId
    );
  }
  if (!kyc || kyc.status !== KYC_STATUS.approved) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Rider KYC is not approved',
      traceId
    );
  }
  return rider;
};

/** Infers money fields from order total and selected payment method. */
export const buildJobMoneyFields = (
  paymentMethod: string,
  totalAmount: number,
  deliveryCharge: number
) => ({
  collectedMoney:
    paymentMethod === JOB_PAYMENT_METHOD.cod ? Number(totalAmount.toFixed(2)) : 0,
  earning: Number((deliveryCharge || 0).toFixed(2)),
});

/** Builds pickup/destination snapshots from shop location and order delivery point. */
export const buildJobLocations = (order: any) => {
  const vendor = order.author;
  const pickupCoordinates = vendor?.location?.coordinates ?? [0, 0];
  const destinationCoordinates =
    order.billingDetails?.deliveryLocation?.coordinates ??
    (order.billingDetails?.deliveryLocation?.longitude !== undefined &&
    order.billingDetails?.deliveryLocation?.latitude !== undefined
      ? [
          order.billingDetails.deliveryLocation.longitude,
          order.billingDetails.deliveryLocation.latitude,
        ]
      : null) ??
    [0, 0];

  return {
    pickup: {
      address: vendor?.address || 'Vendor address',
      coordinates: pickupCoordinates,
    },
    destination: {
      address: order.billingDetails?.address || 'Customer address',
      coordinates: destinationCoordinates,
    },
  };
};

/** Returns true when a job can be replaced by a new assignment. */
export const isReassignableJob = (status: string) =>
  [JOB_STATUS.matching, JOB_STATUS.assigned, JOB_STATUS.cancelled].includes(
    status as any
  );

const toIdString = (value: unknown) => String((value as any)?._id ?? value ?? '');

/** Loads rider matching intervals and attempt limits from general settings. */
export const getRiderMatchSettings = async () => {
  const [intervalSeconds, maxAttempts] = await Promise.all([
    SettingService.getNumericSetting(
      'riderMatchIntervalSeconds',
      RIDER_MATCH_DEFAULTS.intervalSeconds
    ),
    SettingService.getNumericSetting(
      'riderMatchMaxAttempts',
      RIDER_MATCH_DEFAULTS.maxAttempts
    ),
  ]);
  return { intervalSeconds, maxAttempts };
};

/** Collects unique nearby online riders around shop coordinates. */
export const collectNearbyRequestedRiders = async (
  latitude: number,
  longitude: number
) => {
  const seenRiderIds = new Set<string>();
  const requestedRider: mongoose.Types.ObjectId[] = [];

  for (const radiusKm of JOB_MATCH_RADIUS_KM) {
    const nearbyRiders = await RiderAvailabilitySocketHelper.findOnlineRiders(
      latitude,
      longitude,
      radiusKm,
      200
    );
    nearbyRiders.forEach((item) => {
      const riderId = item.rider?._id?.toString();
      if (!riderId || seenRiderIds.has(riderId)) return;
      seenRiderIds.add(riderId);
      requestedRider.push(item.rider!._id);
    });
  }

  return requestedRider;
};

const getSocketIO = () =>
  (require('../../socket/socket.init') as typeof import('@/app/socket/socket.init')).getIO();

/** Emits job:new-request and queues rider push notifications. */
export const notifyJobOffer = async (job: any, riderIds: string[]) => {
  if (!riderIds.length) return;
  const io = getSocketIO();
  riderIds.forEach((riderId) => io.to(riderId).emit(SOCKET_EMIT.jobNewRequest, job));
  await sendBatchNotificationViaQueue({
    userIds: riderIds,
    channel: 'both',
    title: 'New delivery nearby',
    message: 'A nearby order is waiting for a rider. Open the app to accept.',
    data: {
      modelType: NOTIFICATION_MODEL_TYPE.Job,
      reference: job._id?.toString?.(),
      jobId: job._id?.toString?.(),
      orderId: toIdString(job.order),
      notice: 'new-request',
    },
  }).catch((error) => {
    console.warn('[Job] Failed to queue rider offer notifications', error);
  });
};

/** Notifies leftover riders that an offer is no longer available. */
export const notifyJobRequestCancelled = async (job: any, riderIds: string[]) => {
  if (!riderIds.length) return;
  const io = getSocketIO();
  riderIds.forEach((riderId) =>
    io.to(riderId).emit(SOCKET_EMIT.jobRequestCancelled, job)
  );
};

/** Notifies leftover riders that another rider took the job. */
export const notifyOtherRidersJobTaken = async (job: any, riderIds: string[]) => {
  if (!riderIds.length) return;
  const io = getSocketIO();
  riderIds.forEach((riderId) => {
    io.to(riderId).emit(SOCKET_EMIT.jobAccepted, job);
    io.to(riderId).emit(SOCKET_EMIT.jobUpdated, job);
    io.to(riderId).emit(SOCKET_EMIT.jobRequestCancelled, job);
  });
};

/** Emits job:rider-assigned and notifies the customer. */
export const notifyJobRiderAssigned = async (job: any, extraRiderIds: string[] = []) => {
  const io = getSocketIO();
  const userId = toIdString(job.user || job.order?.user);
  const authorId = toIdString(job.order?.author);
  const assignedBy = toIdString(job.assignedBy);
  const riderId = toIdString(job.rider);
  const audience = [
    ...extraRiderIds,
    userId,
    authorId,
    assignedBy,
    riderId,
  ].filter((id) => id && id !== 'undefined' && id !== 'null');

  [...new Set(audience)].forEach((id) => io.to(id).emit(SOCKET_EMIT.jobRiderAssigned, job));
};

/** Notifies agents that auto-matching stopped and they should assign manually. */
export const notifyMatchingExhausted = async (job: any) => {
  const agents = await User.find({
    role: USER_ROLE.agent,
    status: USER_STATUS.active,
    isDeleted: false,
  })
    .select('_id')
    .lean();
  const agentIds = agents.map((agent) => agent._id.toString());
  if (!agentIds.length) return;

  const io = getSocketIO();
  agentIds.forEach((agentId) => io.to(agentId).emit(SOCKET_EMIT.jobMatchingExhausted, job));
  await sendBatchNotificationViaQueue({
    userIds: agentIds,
    channel: 'both',
    title: 'Rider matching failed',
    message: 'No rider accepted this job. Assign a rider manually.',
    data: {
      modelType: NOTIFICATION_MODEL_TYPE.Job,
      reference: job._id?.toString?.(),
      jobId: job._id?.toString?.(),
      orderId: toIdString(job.order),
      notice: 'matching-exhausted',
    },
  }).catch((error) => {
    console.warn('[Job] Failed to queue matching-exhausted notifications', error);
  });
};

/** Stops auto matching for an order job. */
export const stopJobMatchingForOrder = async (orderId: string) => {
  await Job.updateMany(
    { order: orderId, matchingEnabled: true, rider: null },
    { matchingEnabled: false, nextMatchAt: null }
  );
};


