import { HttpStatusCode } from 'axios';
import mongoose from 'mongoose';

import ApiError from '@/app/errors/ApiError';
import {
  JOB_ASSIGNMENT_TYPE,
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
} from '@/app/modules/job/job.helpers';
import { Job } from '@/app/modules/job/job.model';
import {
  TAssignJobPayload,
  TFindOnlineRiderPayload,
  TGeoPayload,
  TJobIdPayload,
  TJobRequester,
  TRejectJobPayload,
  TVerifyDeliveryOtpPayload,
} from '@/app/modules/job/job.types';
import { ORDER_STATUS } from '@/app/modules/orders/orders.constant';
import { Orders } from '@/app/modules/orders/orders.model';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import { RiderAvailabilitySocketHelper } from '@/app/socket/utils/riderAvailability.helpers';

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
) => RiderAvailabilitySocketHelper.goOnline(traceId, riderId, payload);

/** Marks rider offline from socket delivery flow. */
const riderGoOffline = async (riderId: string) =>
  RiderAvailabilitySocketHelper.goOffline(riderId);

/** Finds nearby online riders for a socket assignment request. */
const findOnlineRider = async (
  traceId: string,
  requester: TJobRequester,
  payload: TFindOnlineRiderPayload
) => {
  const order = await getAssignableOrderOrThrow(traceId, payload.orderId);
  assertCanAssignOrder(traceId, order, requester);

  return RiderAvailabilitySocketHelper.findOnlineRiders(
    payload.latitude,
    payload.longitude,
    payload.radiusKm
  );
};

/** Creates or replaces an assignable rider job from socket flow. */
const assignJob = async (
  traceId: string,
  requester: TJobRequester,
  payload: TAssignJobPayload
) => {
  const [order] = await Promise.all([
    getAssignableOrderOrThrow(traceId, payload.orderId),
    getAssignableRiderOrThrow(traceId, payload.riderId),
  ]);
  assertCanAssignOrder(traceId, order, requester);

  const existingJob = await Job.findOne({
    order: payload.orderId,
    status: { $ne: JOB_STATUS.delivered },
  });
  if (existingJob && !isReassignableJob(existingJob.status)) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'This order already has an active job',
      traceId
    );
  }

  const paymentMethod = payload.paymentMethod ?? JOB_PAYMENT_METHOD.card;
  const moneyFields = buildJobMoneyFields(
    paymentMethod,
    order.totalAmount,
    order.deliveryCharge
  );
  const locationFields = buildJobLocations(order);
  const assignmentType =
    payload.assignmentType ??
    (requester.role === USER_ROLE.admin
      ? JOB_ASSIGNMENT_TYPE.admin
      : JOB_ASSIGNMENT_TYPE.vendor);

  const job = await Job.findOneAndUpdate(
    { order: payload.orderId },
    {
      order: payload.orderId,
      rider: payload.riderId,
      assignedBy:
        assignmentType === JOB_ASSIGNMENT_TYPE.auto ? null : requester.userId,
      assignmentType,
      paymentMethod,
      deliveryType: order.deliveryType,
      ...locationFields,
      ...moneyFields,
      hasDeliveryOtpVerified: false,
      status: JOB_STATUS.assigned,
      acceptedAt: null,
      pickedUpAt: null,
      onTheWayAt: null,
      completedAt: null,
      cancelledAt: null,
      rejectionReason: null,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).populate(jobPopulate);

  await Promise.all([
    Orders.findByIdAndUpdate(payload.orderId, { status: ORDER_STATUS.rider_assigned }),
    RiderAvailabilitySocketHelper.setActiveJob(payload.riderId, job!._id.toString()),
  ]);

  return job;
};

/** Rider accepts their assigned socket job. */
const acceptJob = async (
  traceId: string,
  riderId: string,
  payload: TJobIdPayload
) => {
  const job = await Job.findById(payload.jobId);
  if (!job) throw new ApiError(HttpStatusCode.NotFound, 'Job not found', traceId);
  assertAssignedRider(traceId, job, riderId);
  assertJobStatusIn(traceId, job, [JOB_STATUS.assigned], 'Only assigned jobs can be accepted');

  job.status = JOB_STATUS.accepted;
  job.acceptedAt = new Date();
  await job.save();
  await RiderAvailabilitySocketHelper.setActiveJob(riderId, job._id.toString());

  return Job.findById(job._id).populate(jobPopulate);
};

/** Rider rejects their assigned socket job. */
const rejectJob = async (
  traceId: string,
  riderId: string,
  payload: TRejectJobPayload
) => {
  const job = await Job.findById(payload.jobId);
  if (!job) throw new ApiError(HttpStatusCode.NotFound, 'Job not found', traceId);
  assertAssignedRider(traceId, job, riderId);
  assertJobStatusIn(traceId, job, [JOB_STATUS.assigned], 'Only assigned jobs can be rejected');

  job.status = JOB_STATUS.rejected;
  job.rejectionReason = payload.reason ?? null;
  await job.save();
  await RiderAvailabilitySocketHelper.setActiveJob(riderId, null);

  return Job.findById(job._id).populate(jobPopulate);
};

/** Moves accepted socket job into go-pickup state. */
const goPickup = async (traceId: string, riderId: string, payload: TJobIdPayload) => {
  const job = await Job.findById(payload.jobId);
  if (!job) throw new ApiError(HttpStatusCode.NotFound, 'Job not found', traceId);
  assertAssignedRider(traceId, job, riderId);
  assertJobStatusIn(traceId, job, [JOB_STATUS.accepted], 'Only accepted jobs can go pickup');

  job.status = JOB_STATUS.go_pickup;
  await job.save();
  return Job.findById(job._id).populate(jobPopulate);
};

/** Marks socket job package pickup complete. */
const pickupJob = async (traceId: string, riderId: string, payload: TJobIdPayload) => {
  const job = await Job.findById(payload.jobId);
  if (!job) throw new ApiError(HttpStatusCode.NotFound, 'Job not found', traceId);
  assertAssignedRider(traceId, job, riderId);
  assertJobStatusIn(
    traceId,
    job,
    [JOB_STATUS.go_pickup, JOB_STATUS.accepted],
    'Job cannot be picked up now'
  );

  job.status = JOB_STATUS.picked_up;
  job.pickedUpAt = new Date();
  await job.save();
  await Orders.findByIdAndUpdate(job.order, { status: ORDER_STATUS.picked_up });
  return Job.findById(job._id).populate(jobPopulate);
};

/** Starts socket job delivery toward customer. */
const onTheWay = async (traceId: string, riderId: string, payload: TJobIdPayload) => {
  const job = await Job.findById(payload.jobId);
  if (!job) throw new ApiError(HttpStatusCode.NotFound, 'Job not found', traceId);
  assertAssignedRider(traceId, job, riderId);
  assertJobStatusIn(traceId, job, [JOB_STATUS.picked_up], 'Pickup is required first');

  job.status = JOB_STATUS.on_the_way;
  job.onTheWayAt = new Date();
  await job.save();
  await Orders.findByIdAndUpdate(job.order, { status: ORDER_STATUS.on_the_way });
  return Job.findById(job._id).populate(jobPopulate);
};

/** Creates or resends a Redis-backed delivery OTP. */
const sendDeliveryOtp = async (
  traceId: string,
  requester: TJobRequester,
  payload: TJobIdPayload
) => {
  const job = await Job.findById(payload.jobId);
  if (!job) throw new ApiError(HttpStatusCode.NotFound, 'Job not found', traceId);
  await assertJobAccess(traceId, job, requester);
  assertJobStatusIn(
    traceId,
    job,
    [JOB_STATUS.on_the_way, JOB_STATUS.otp_sent],
    'Delivery must be on the way before sending OTP'
  );

  const otp = generateDeliveryOtp();
  await saveDeliveryOtpToRedis(job._id.toString(), await hashDeliveryOtp(otp));
  job.hasDeliveryOtpVerified = false;
  job.status = JOB_STATUS.otp_sent;
  await job.save();

  return { job: await Job.findById(job._id).populate(jobPopulate), otp };
};

/** Verifies customer delivery OTP from Redis. */
const verifyDeliveryOtp = async (
  traceId: string,
  riderId: string,
  payload: TVerifyDeliveryOtpPayload
) => {
  const job = await Job.findById(payload.jobId);
  if (!job) throw new ApiError(HttpStatusCode.NotFound, 'Job not found', traceId);
  assertAssignedRider(traceId, job, riderId);
  assertJobStatusIn(traceId, job, [JOB_STATUS.otp_sent], 'OTP is not ready for verification');

  const storedOtp = await getDeliveryOtpFromRedis(job._id.toString());
  if (!storedOtp) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Delivery OTP has expired', traceId);
  }
  if (!(await compareDeliveryOtp(payload.otp, storedOtp))) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Invalid delivery OTP', traceId);
  }

  job.hasDeliveryOtpVerified = true;
  await Promise.all([
    job.save(),
    Orders.findByIdAndUpdate(job.order, { isOtpVerified: true }),
    deleteDeliveryOtpFromRedis(job._id.toString()),
  ]);

  return Job.findById(job._id).populate(jobPopulate);
};

/** Marks socket job delivered after OTP verification. */
const deliveredJob = async (
  traceId: string,
  riderId: string,
  payload: TJobIdPayload
) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();
    const job = await Job.findById(payload.jobId).session(session);
    if (!job) throw new ApiError(HttpStatusCode.NotFound, 'Job not found', traceId);
    assertAssignedRider(traceId, job, riderId);
    assertJobStatusIn(traceId, job, [JOB_STATUS.otp_sent], 'OTP verification is required before delivery');

    const order = await Orders.findById(job.order).session(session);
    if (!order?.isOtpVerified || !job.hasDeliveryOtpVerified) {
      throw new ApiError(HttpStatusCode.BadRequest, 'Delivery OTP is not verified', traceId);
    }

    job.status = JOB_STATUS.delivered;
    job.completedAt = new Date();
    await job.save({ session });

    order.status = ORDER_STATUS.delivered;
    await order.save({ session });

    await session.commitTransaction();
    await RiderAvailabilitySocketHelper.setActiveJob(riderId, null);

    return Job.findById(job._id).populate(jobPopulate);
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

/** Updates live rider location for a socket job. */
const riderLocationUpdate = async (
  traceId: string,
  riderId: string,
  payload: TJobIdPayload & { latitude: number; longitude: number; heading?: number }
) => {
  const job = await Job.findById(payload.jobId);
  if (!job) throw new ApiError(HttpStatusCode.NotFound, 'Job not found', traceId);
  assertAssignedRider(traceId, job, riderId);

  const availability = await RiderAvailabilitySocketHelper.updateLocation(riderId, {
    latitude: payload.latitude,
    longitude: payload.longitude,
    heading: payload.heading,
    activeJob: payload.jobId,
  });

  return { jobId: payload.jobId, riderId, availability };
};

export const JobSocketActions = {
  riderGoOnline,
  riderGoOffline,
  findOnlineRider,
  assignJob,
  acceptJob,
  rejectJob,
  goPickup,
  pickupJob,
  onTheWay,
  sendDeliveryOtp,
  verifyDeliveryOtp,
  deliveredJob,
  riderLocationUpdate,
};
