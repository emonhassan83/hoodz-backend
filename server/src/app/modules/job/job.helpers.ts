import { compare, hash } from 'bcrypt';
import { HttpStatusCode } from 'axios';
import { Secret, sign, verify } from 'jsonwebtoken';
import mongoose from 'mongoose';
import twilio from 'twilio';

import { env } from '@/app/configs/env.configs';
import ApiError from '@/app/errors/ApiError';
import { getRedisClient } from '@/app/configs/redis.config';
import {
  DELIVERY_OTP_TTL_SECONDS,
  JOB_ACTIVE_STATUSES,
  JOB_MATCH_RADIUS_KM,
  RIDER_MATCH_DEFAULTS,
} from '@/app/constant';
import {
  JOB_DEPOSIT_STATUS,
  JOB_PAYMENT_METHOD,
  JOB_STATUS,
} from '@/app/modules/job/job.constant';
import { IJob } from '@/app/modules/job/job.interface';
import { Job } from '@/app/modules/job/job.model';
import { ORDER_STATUS } from '@/app/modules/orders/orders.constant';
import { Orders } from '@/app/modules/orders/orders.model';
import { Payment } from '@/app/modules/payment/payment.model';
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
  job: Pick<IJob, 'rider' | 'assignedBy' | 'order' | 'requestedRider' | 'user'>,
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
  const isCustomer = String((job.user as any)?._id ?? job.user) === userId;
  const canAccess =
    requester.role === USER_ROLE.admin ||
    requester.role === USER_ROLE.agent ||
    isCustomer ||
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
  job: Pick<IJob, 'rider' | 'requestedRider' | 'offeredRider'>,
  riderId: string
) => {
  if (job.rider) {
    assertAssignedRider(traceId, job, riderId);
    return;
  }

  const isOffered = [...(job.requestedRider ?? []), ...(job.offeredRider ?? [])].some(
    (rider) => rider.toString() === riderId
  );
  if (!isOffered) {
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

/** Reads the latest order payment method so jobs stay in sync with COD/card/wallet. */
export const resolveOrderPaymentMethod = async (orderId: string) => {
  const payment = await Payment.findOne({
    order: orderId,
    isDeleted: { $ne: true },
  })
    .select('paymentMethod')
    .sort({ createdAt: -1 })
    .lean();

  const method = payment?.paymentMethod;
  if (
    method &&
    Object.values(JOB_PAYMENT_METHOD).includes(
      method as (typeof JOB_PAYMENT_METHOD)[keyof typeof JOB_PAYMENT_METHOD]
    )
  ) {
    return method as (typeof JOB_PAYMENT_METHOD)[keyof typeof JOB_PAYMENT_METHOD];
  }

  return JOB_PAYMENT_METHOD.card;
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

const toLngLat = (point?: { coordinates?: number[] }) => {
  const [longitude, latitude] = point?.coordinates ?? [];
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    (latitude === 0 && longitude === 0)
  ) {
    return null;
  }
  return { latitude, longitude };
};

/** Driving distance in km from pickup to destination via Google Distance Matrix. */
export const getPickupToDestinationDistanceKm = async (
  pickup?: { coordinates?: number[] },
  destination?: { coordinates?: number[] }
) => {
  const origin = toLngLat(pickup);
  const target = toLngLat(destination);
  if (!origin || !target) return null;

  try {
    const { getGoogleDistanceMatrix } = await import(
      '@/app/modules/user/user.helpers'
    );
    const [element] = await getGoogleDistanceMatrix(origin, [target]);
    if (element?.status === 'OK' && element.distance?.value !== undefined) {
      return Number((element.distance.value / 1000).toFixed(2));
    }
  } catch (error) {
    console.warn('[Job] Google pickup-destination distance failed:', error);
  }

  return null;
};

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

export const buildJobLocationFields = async (order: any) => {
  const locations = buildJobLocations(order);
  return {
    ...locations,
    distance: await getPickupToDestinationDistanceKm(
      locations.pickup,
      locations.destination
    ),
  };
};

const JOB_LIST_CARD_FIELDS =
  '_id id deliveryType destination earning pickup status createdAt distance depositStatus paymentMethod collectedMoney assignmentType';

export const isJobDepositSubmitted = (depositStatus?: string | null) =>
  depositStatus === JOB_DEPOSIT_STATUS.submitted ||
  depositStatus === JOB_DEPOSIT_STATUS.verified;

/** Maps jobs into rider list-card payloads and backfills missing Google distances. */
export const mapJobsToListCards = async (jobs: Array<Record<string, any>>) => {
  const jobsWithDistance = await Promise.all(
    jobs.map(async (job) => {
      if (job.distance != null) return job;
      const distance = await getPickupToDestinationDistanceKm(
        job.pickup,
        job.destination
      );
      if (distance != null) {
        await Job.updateOne({ _id: job._id }, { distance }).catch(() => undefined);
      }
      return { ...job, distance };
    })
  );

  return jobsWithDistance.map((job) => ({
    _id: job._id,
    deliveryType: job.deliveryType,
    destination: job.destination,
    earning: job.earning,
    collectedMoney: job.collectedMoney ?? 0,
    distance: job.distance ?? null,
    id: job.id,
    pickup: job.pickup,
    paymentMethod: job.paymentMethod,
    assignmentType: job.assignmentType,
    status: job.status,
    createdAt: job.createdAt,
    isDepositSubmitted: isJobDepositSubmitted(job.depositStatus),
  }));
};

export const jobListCardSelect = JOB_LIST_CARD_FIELDS;

/** Returns true when a job can be replaced by a new assignment. */
export const isReassignableJob = (status: string) =>
  [JOB_STATUS.matching, JOB_STATUS.assigned].includes(status as any);

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

/** Expanding search radius for this match attempt (phase 1 = closest). */
export const getMatchPhaseRadiusKm = (attempt: number) => {
  const phaseIndex = Math.min(
    Math.max(attempt, 1) - 1,
    JOB_MATCH_RADIUS_KM.length - 1
  );
  return JOB_MATCH_RADIUS_KM[phaseIndex];
};

/** Collects only new nearby riders for the current match phase. */
export const collectPhaseRequestedRiders = async (
  latitude: number,
  longitude: number,
  attempt: number,
  excludeRiderIds: string[] = []
) => {
  const exclude = new Set(excludeRiderIds);
  const nearbyRiders = await RiderAvailabilitySocketHelper.findOnlineRiders(
    latitude,
    longitude,
    getMatchPhaseRadiusKm(attempt),
    200
  );

  return nearbyRiders
    .filter((item) => {
      const riderId = item.rider?._id?.toString();
      return Boolean(riderId && !exclude.has(riderId));
    })
    .map((item) => item.rider!._id);
};

const getSocketIO = () =>
  (require('../../socket/socket.init') as typeof import('@/app/socket/socket.init')).getIO();

/** Emits job:new-request and queues rider push notifications. */
export const notifyJobOffer = async (
  job: any,
  riderIds: string[],
  options?: { attempt?: number; maxAttempts?: number }
) => {
  if (!riderIds.length) return;
  const attempt = options?.attempt ?? job.matchAttemptCount ?? 1;
  const maxAttempts = options?.maxAttempts;
  const isRematch = attempt > 1;
  const io = getSocketIO();
  riderIds.forEach((riderId) => io.to(riderId).emit(SOCKET_EMIT.jobNewRequest, job));
  await sendBatchNotificationViaQueue({
    userIds: riderIds,
    channel: 'both',
    title: isRematch ? 'Delivery still waiting' : 'New delivery nearby',
    message: isRematch
      ? `Still unassigned. Offer ${attempt}${maxAttempts ? ` of ${maxAttempts}` : ''} — accept if available.`
      : 'A nearby order is waiting for a rider. Open the app to accept.',
    data: {
      modelType: NOTIFICATION_MODEL_TYPE.Job,
      reference: job._id?.toString?.(),
      jobId: job._id?.toString?.(),
      orderId: toIdString(job.order),
      notice: isRematch ? 'rematch' : 'new-request',
      matchAttempt: String(attempt),
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
    io.to(riderId).emit(SOCKET_EMIT.jobRequestCancelled, job);
  });
};

/** Emits job:assigned to the rider who received a manual assignment. */
export const notifyJobAssignedToRider = async (job: any, riderId: string) => {
  if (!riderId) return;
  const io = getSocketIO();
  io.to(riderId).emit(SOCKET_EMIT.jobAssigned, job);
};

/** Emits job:rider-assigned to the customer only. */
export const notifyJobRiderAssigned = async (job: any, _extraRiderIds: string[] = []) => {
  const io = getSocketIO();
  const userId = toIdString(job.user || job.order?.user);
  if (!userId || userId === 'undefined' || userId === 'null') return;

  io.to(userId).emit(SOCKET_EMIT.jobRiderAssigned, job);
};

/** Notifies connected agents/admins that auto-matching stopped. */
export const notifyMatchingExhausted = async (job: any) => {
  const payload = JSON.parse(JSON.stringify(job));
  try {
    const { emitToRoles, emitToUserIds } = require('../../socket/utils/jobSocket.helpers') as typeof import('@/app/socket/utils/jobSocket.helpers');
    emitToRoles(
      [USER_ROLE.agent, USER_ROLE.admin],
      SOCKET_EMIT.jobMatchingExhausted,
      payload
    );

    const staff = await User.find({
      role: { $in: [USER_ROLE.agent, USER_ROLE.admin] },
      isDeleted: { $ne: true },
    })
      .select('_id')
      .lean();
    const staffIds = staff.map((user) => user._id.toString());
    emitToUserIds(staffIds, SOCKET_EMIT.jobMatchingExhausted, payload);

    if (staffIds.length) {
      await sendBatchNotificationViaQueue({
        userIds: staffIds,
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
    }
  } catch (error) {
    console.warn('[Job] Failed to emit matching-exhausted', error);
  }
};

/** Stops auto matching for an order job. */
export const stopJobMatchingForOrder = async (orderId: string) => {
  await Job.updateMany(
    { order: orderId, matchingEnabled: true, rider: null },
    { matchingEnabled: false, nextMatchAt: null }
  );
};

export const toRiderObjectId = (riderId: string) =>
  new mongoose.Types.ObjectId(riderId);

export const toObjectIdList = (ids: string[]) =>
  ids.filter(Boolean).map((id) => new mongoose.Types.ObjectId(id));

/** Pending unmatched offers for a rider. Assigned jobs belong in my-jobs. */
export const riderRequestJobFilter = (riderId: string) => {
  const riderObjectId = toRiderObjectId(riderId);
  return {
    status: JOB_STATUS.matching,
    rider: null,
    $or: [
      { requestedRider: riderObjectId },
      { requestedRider: riderId },
      { offeredRider: riderObjectId },
      { offeredRider: riderId },
    ],
  };
};

export const jobPopulate = [
  {
    path: 'order',
    select:
      'id user author totalAmount deliveryCharge status paymentStatus billingDetails deliveryType isOtpVerified',
  },
  { path: 'rider', select: 'name email phone profileAvatar avgRating ratingCount' },
  { path: 'user', select: 'name email phone profileAvatar' },
  { path: 'requestedRider', select: 'name email phone profileAvatar' },
  { path: 'assignedBy', select: 'name email role' },
];

export const parseBooleanQuery = (value: unknown) => {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return undefined;
};

const JOB_LIST_QUERY_KEYS = [
  'filter',
  'isDepositSubmitted',
  'paymentMethod',
  'depositStatus',
  'assignmentType',
] as const;

export const stripJobListQueryParams = (query: Record<string, unknown>) => {
  const restQuery = { ...query };
  JOB_LIST_QUERY_KEYS.forEach((key) => {
    delete restQuery[key];
  });
  return restQuery;
};

/** Applies list filters for my-jobs and rider jobs. */
export const applyJobListQueryFilters = (
  base: Record<string, unknown>,
  query: Record<string, unknown>
) => {
  const filter: Record<string, unknown> = { ...base };

  if (query.filter === 'completed') {
    filter.status = JOB_STATUS.delivered;
  } else if (query.filter === 'active') {
    filter.status = { $in: [JOB_STATUS.assigned, ...JOB_ACTIVE_STATUSES] };
  }

  if (typeof query.paymentMethod === 'string' && query.paymentMethod) {
    filter.paymentMethod = query.paymentMethod;
  }

  if (typeof query.assignmentType === 'string' && query.assignmentType) {
    filter.assignmentType = query.assignmentType;
  }

  if (typeof query.depositStatus === 'string' && query.depositStatus) {
    filter.depositStatus = query.depositStatus;
  } else {
    const isDepositSubmitted = parseBooleanQuery(query.isDepositSubmitted);
    if (isDepositSubmitted === true) {
      filter.depositStatus = {
        $in: [JOB_DEPOSIT_STATUS.submitted, JOB_DEPOSIT_STATUS.verified],
      };
    }
    if (isDepositSubmitted === false) {
      filter.depositStatus = {
        $nin: [JOB_DEPOSIT_STATUS.submitted, JOB_DEPOSIT_STATUS.verified],
      };
    }
  }

  return filter;
};

export const assertShopAndDeliveryLocations = (traceId: string, order: any) => {
  const pickup = order.author as { location?: { coordinates?: number[] } };
  const [longitude, latitude] = pickup?.location?.coordinates ?? [0, 0];
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !latitude || !longitude) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Shop location is required to match nearby riders',
      traceId
    );
  }

  const destination = order.billingDetails?.deliveryLocation;
  const [destinationLng, destinationLat] = destination?.coordinates ?? [];
  if (
    !Number.isFinite(destinationLng) ||
    !Number.isFinite(destinationLat) ||
    (destinationLng === 0 && destinationLat === 0)
  ) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Order delivery location is required to create a job',
      traceId
    );
  }

  return { latitude, longitude };
};

export const exhaustMatching = async (jobId: string) => {
  const job = await Job.findOneAndUpdate(
    { _id: jobId, rider: null, matchingEnabled: true },
    { matchingEnabled: false, nextMatchAt: null },
    { new: true }
  ).populate(jobPopulate);
  if (job) await notifyMatchingExhausted(job);
  return job;
};

export const applyMatchRound = async (traceId: string, jobId: string) => {
  const job = await Job.findById(jobId);
  if (
    !job ||
    job.rider ||
    !job.matchingEnabled ||
    ![JOB_STATUS.matching, JOB_STATUS.assigned].includes(job.status as any)
  ) {
    return Job.findById(jobId).populate(jobPopulate);
  }

  const order = await getAssignableOrderOrThrow(traceId, job.order.toString());
  if (order.status === ORDER_STATUS.cancelled || order.isDeleted) {
    return exhaustMatching(jobId);
  }

  const settings = await getRiderMatchSettings();
  if ((job.matchAttemptCount ?? 0) >= settings.maxAttempts) {
    return exhaustMatching(jobId);
  }

  const { latitude, longitude } = assertShopAndDeliveryLocations(traceId, order);
  const pendingRiderIds = (job.requestedRider ?? []).map((rider) => rider.toString());
  const declinedRiderIds = (job.declinedRider ?? []).map((rider) => rider.toString());
  const offeredRiderIds = (job.offeredRider ?? []).map((rider) => rider.toString());
  const nextAttempt = (job.matchAttemptCount ?? 0) + 1;
  const phaseRiders = await collectPhaseRequestedRiders(
    latitude,
    longitude,
    nextAttempt,
    [...new Set([...offeredRiderIds, ...declinedRiderIds])]
  );
  const newRiderIds = phaseRiders.map((rider) => rider.toString());
  const requestedRiderIds = [
    ...new Set([
      ...offeredRiderIds.filter((id) => !declinedRiderIds.includes(id)),
      ...pendingRiderIds.filter((id) => !declinedRiderIds.includes(id)),
      ...newRiderIds,
    ]),
  ];
  const offeredRiderIdsNext = [...new Set([...offeredRiderIds, ...newRiderIds])];
  const now = new Date();
  const nextMatchAt = new Date(now.getTime() + settings.intervalSeconds * 1000);

  const updated = await Job.findOneAndUpdate(
    {
      _id: jobId,
      rider: null,
      matchingEnabled: true,
      matchAttemptCount: job.matchAttemptCount ?? 0,
      status: { $in: [JOB_STATUS.matching, JOB_STATUS.assigned] },
    },
    {
      requestedRider: toObjectIdList(requestedRiderIds),
      offeredRider: toObjectIdList(offeredRiderIdsNext),
      user: (order.user as any)?._id ?? order.user ?? job.user,
      matchAttemptCount: nextAttempt,
      lastMatchedAt: now,
      nextMatchAt,
      status: JOB_STATUS.matching,
    },
    { new: true }
  ).populate(jobPopulate);

  if (!updated) return Job.findById(jobId).populate(jobPopulate);

  await notifyJobOffer(updated, newRiderIds, {
    attempt: nextAttempt,
    maxAttempts: settings.maxAttempts,
  });
  return updated;
};


