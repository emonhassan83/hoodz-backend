import { HttpStatusCode } from 'axios';
import mongoose from 'mongoose';

import ApiError from '@/app/errors/ApiError';
import {
  JOB_PAYMENT_METHOD,
  JOB_STATUS,
} from '@/app/modules/job/job.constant';
import {
  assertAssignedRider,
  assertCanAssignOrder,
  assertJobAccess,
  assertJobStatusIn,
  buildJobLocations,
  buildJobMoneyFields,
  compareDeliveryOtp,
  deleteDeliveryOtpFromRedis,
  generateDeliveryOtp,
  getAssignableOrderOrThrow,
  getAssignableRiderOrThrow,
  getDeliveryOtpFromRedis,
  hashDeliveryOtp,
  isReassignableJob,
  saveDeliveryOtpToRedis,
  sendDeliveryOtpSms,
} from '@/app/modules/job/job.helpers';
import { Job } from '@/app/modules/job/job.model';
import {
  TAssignJobPayload,
  TFindOnlineRiderPayload,
  TGeoPayload,
  TJobIdPayload,
  TJobRequester,
  TRejectJobPayload,
  TRiderLocationUpdatePayload,
  TVerifyDeliveryOtpPayload,
} from '@/app/modules/job/job.types';
import { ORDER_STATUS } from '@/app/modules/orders/orders.constant';
import { Orders } from '@/app/modules/orders/orders.model';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import {
  RiderAvailabilitySocketHelper,
  normalizeRiderGeo,
} from '@/app/socket/utils/riderAvailability.helpers';

const jobPopulate = [
  {
    path: 'order',
    select:
      'id user author totalAmount deliveryCharge status paymentStatus billingDetails deliveryType isOtpVerified',
  },
  { path: 'rider', select: 'name email phone profileAvatar avgRating ratingCount' },
  { path: 'assignedBy', select: 'name email role' },
];

/** Marks rider online from socket delivery flow. */
const riderGoOnline = async (
  traceId: string,
  riderId: string,
  payload: TGeoPayload
) => {
  const geo = normalizeRiderGeo(payload);
  if (!geo) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Rider latitude and longitude are required'
    );
  }
  return RiderAvailabilitySocketHelper.goOnline(traceId, riderId, geo);
};

/** Finds nearby online riders for a socket assignment request. */
const findOnlineRider = async (
  traceId: string,
  requester: TJobRequester,
  payload: TFindOnlineRiderPayload
) => {
  const order = await getAssignableOrderOrThrow(traceId, payload.orderId);
  assertCanAssignOrder(traceId, order, requester);
  const shop = order.author as { location?: { coordinates?: number[] } };
  const [longitude, latitude] = shop?.location?.coordinates ?? [];
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !latitude || !longitude) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Shop location is required to find nearby riders',
      traceId
    );
  }

  return RiderAvailabilitySocketHelper.findOnlineRidersNearShop(
    latitude,
    longitude,
    payload.radiusKm
  );
};

/** Loads JobService after modules finish initializing to avoid a circular import. */
const getJobService = async () =>
  (await import('@/app/modules/job/job.services')).JobService;

/** Marks rider offline from socket delivery flow. */
const riderGoOffline = async (
  traceId: string,
  riderId: string,
  payload?: TGeoPayload
) => (await getJobService()).riderGoOffline(traceId, riderId, payload);

/** Creates or replaces an assignable rider job from socket flow. */
const assignJob = async (
  traceId: string,
  requester: TJobRequester,
  payload: TAssignJobPayload
) => (await getJobService()).assignJob(traceId, requester, payload);

/** Rider accepts their assigned socket job. */
const acceptJob = async (traceId: string, riderId: string, payload: TJobIdPayload) =>
  (await getJobService()).acceptJob(traceId, riderId, payload);

/** Rider rejects their assigned socket job. */
const rejectJob = async (traceId: string, riderId: string, payload: TRejectJobPayload) =>
  (await getJobService()).rejectJob(traceId, riderId, payload);

/** Marks socket job package pickup complete. */
const pickupJob = async (traceId: string, riderId: string, payload: TJobIdPayload) =>
  (await getJobService()).pickupJob(traceId, riderId, payload);

/** Starts socket job delivery toward customer. */
const onTheWay = async (traceId: string, riderId: string, payload: TJobIdPayload) =>
  (await getJobService()).onTheWay(traceId, riderId, payload);

/** Creates or resends a Redis-backed delivery OTP. */
const sendDeliveryOtp = async (
  traceId: string,
  requester: TJobRequester,
  payload: TJobIdPayload
) => (await getJobService()).sendDeliveryOtp(traceId, requester, payload);

/** Verifies customer delivery OTP from Redis. */
const verifyDeliveryOtp = async (
  traceId: string,
  riderId: string,
  payload: TVerifyDeliveryOtpPayload
) => (await getJobService()).verifyDeliveryOtp(traceId, riderId, payload);

/** Marks socket job delivered after OTP verification. */
const deliveredJob = async (traceId: string, riderId: string, payload: TJobIdPayload) =>
  (await getJobService()).deliveredJob(traceId, riderId, payload);

/** Updates live rider location for a socket job or idle online rider. */
const riderLocationUpdate = async (
  traceId: string,
  riderId: string,
  payload: TRiderLocationUpdatePayload
) => (await getJobService()).riderLocationUpdate(traceId, riderId, payload);

export const JobSocketActions = {
  riderGoOnline,
  riderGoOffline,
  findOnlineRider,
  assignJob,
  acceptJob,
  rejectJob,
  pickupJob,
  onTheWay,
  sendDeliveryOtp,
  verifyDeliveryOtp,
  deliveredJob,
  riderLocationUpdate,
};
