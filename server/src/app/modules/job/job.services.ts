import { HttpStatusCode } from 'axios';
import mongoose from 'mongoose';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import {
  JOB_ASSIGNMENT_TYPE,
  JOB_DEPOSIT_STATUS,
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
  generateDeliveryOtp,
  getAssignableOrderOrThrow,
  getAssignableRiderOrThrow,
  hashDeliveryOtp,
  isReassignableJob,
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
import { RiderWalletService } from '@/app/modules/riderWallet/riderWallet.services';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import { RiderAvailabilitySocketHelper } from '@/app/socket/utils/riderAvailability.helpers';

const jobPopulate = [
  {
    path: 'order',
    select:
      'id user author totalAmount deliveryCharge status paymentStatus billingDetails deliveryType isOtpVerified',
  },
  { path: 'rider', select: 'name email phone profileAvatar avgRating ratingCount' },
  { path: 'vendor', select: 'name email phone profileAvatar address location' },
  { path: 'assignedBy', select: 'name email role' },
];

/** Marks rider online for delivery jobs. */
const riderGoOnline = async (
  traceId: string,
  riderId: string,
  payload: TGeoPayload
) => RiderAvailabilitySocketHelper.goOnline(traceId, riderId, payload);

/** Marks rider offline for delivery jobs. */
const riderGoOffline = async (riderId: string) =>
  RiderAvailabilitySocketHelper.goOffline(riderId);

/** Finds nearby online riders for a vendor/admin order assignment. */
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

/** Creates or replaces an assignable rider job for an order. */
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
      vendor: order.author,
      assignedBy: requester.userId,
      assignmentType,
      paymentMethod,
      ...locationFields,
      ...moneyFields,
      depositStatus:
        paymentMethod === JOB_PAYMENT_METHOD.cod
          ? JOB_DEPOSIT_STATUS.pending
          : JOB_DEPOSIT_STATUS.not_required,
      status: JOB_STATUS.assigned,
      assignedAt: new Date(),
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

/** Rider accepts their assigned job. */
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

/** Rider rejects their assigned job and releases availability. */
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

/** Moves accepted job to pickup travel state. */
const goPickup = async (traceId: string, riderId: string, payload: TJobIdPayload) => {
  const job = await Job.findById(payload.jobId);
  if (!job) throw new ApiError(HttpStatusCode.NotFound, 'Job not found', traceId);
  assertAssignedRider(traceId, job, riderId);
  assertJobStatusIn(traceId, job, [JOB_STATUS.accepted], 'Only accepted jobs can go pickup');

  job.status = JOB_STATUS.go_pickup;
  await job.save();
  return Job.findById(job._id).populate(jobPopulate);
};

/** Marks package pickup complete and updates order. */
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

/** Starts delivery toward the customer. */
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

/** Creates and stores a delivery OTP for the customer handoff. */
const sendDeliveryOtp = async (
  traceId: string,
  requester: TJobRequester,
  payload: TJobIdPayload
) => {
  const job = await Job.findById(payload.jobId);
  if (!job) throw new ApiError(HttpStatusCode.NotFound, 'Job not found', traceId);
  assertJobAccess(traceId, job, requester);
  assertJobStatusIn(
    traceId,
    job,
    [JOB_STATUS.on_the_way, JOB_STATUS.otp_sent],
    'Delivery must be on the way before sending OTP'
  );

  const otp = generateDeliveryOtp();
  job.deliveryOtp = await hashDeliveryOtp(otp);
  job.deliveryOtpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
  job.status = JOB_STATUS.otp_sent;
  await job.save();

  return { job: await Job.findById(job._id).populate(jobPopulate), otp };
};

/** Verifies customer delivery OTP and marks order OTP verified. */
const verifyDeliveryOtp = async (
  traceId: string,
  riderId: string,
  payload: TVerifyDeliveryOtpPayload
) => {
  const job = await Job.findById(payload.jobId).select('+deliveryOtp');
  if (!job) throw new ApiError(HttpStatusCode.NotFound, 'Job not found', traceId);
  assertAssignedRider(traceId, job, riderId);
  assertJobStatusIn(traceId, job, [JOB_STATUS.otp_sent], 'OTP is not ready for verification');
  if (!job.deliveryOtp || !job.deliveryOtpExpiresAt || job.deliveryOtpExpiresAt < new Date()) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Delivery OTP has expired', traceId);
  }
  if (!(await compareDeliveryOtp(payload.otp, job.deliveryOtp))) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Invalid delivery OTP', traceId);
  }

  await Orders.findByIdAndUpdate(job.order, { isOtpVerified: true });
  return Job.findById(job._id).populate(jobPopulate);
};

/** Completes a job, delivers the order, and creates rider earning once. */
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
    if (!order?.isOtpVerified) {
      throw new ApiError(HttpStatusCode.BadRequest, 'Delivery OTP is not verified', traceId);
    }

    job.status = JOB_STATUS.delivered;
    job.completedAt = new Date();
    job.depositStatus =
      job.paymentMethod === JOB_PAYMENT_METHOD.cod
        ? JOB_DEPOSIT_STATUS.pending
        : JOB_DEPOSIT_STATUS.not_required;
    await job.save({ session });

    order.status = ORDER_STATUS.delivered;
    await order.save({ session });

    await session.commitTransaction();
    await Promise.all([
      RiderWalletService.createJobEarning(riderId, job._id.toString(), job.earning),
      RiderAvailabilitySocketHelper.setActiveJob(riderId, null),
    ]);

    return Job.findById(job._id).populate(jobPopulate);
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

/** Updates live rider location for one job. */
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

/** Returns rider current active jobs. */
const getCurrentRiderJobs = async (riderId: string, query: Record<string, unknown>) => {
  const jobQuery = new QueryBuilder(
    Job.find({
      rider: riderId,
      status: { $nin: [JOB_STATUS.delivered, JOB_STATUS.rejected, JOB_STATUS.cancelled] },
    })
      .populate(jobPopulate)
      .select('-__v')
      .lean(),
    query
  )
    .sort()
    .paginate()
    .fields();

  const [data, meta] = await Promise.all([jobQuery.modelQuery, jobQuery.countTotal()]);
  return { meta, data };
};

/** Returns rider past jobs. */
const getRiderHistory = async (riderId: string, query: Record<string, unknown>) => {
  const jobQuery = new QueryBuilder(
    Job.find({
      rider: riderId,
      status: { $in: [JOB_STATUS.delivered, JOB_STATUS.rejected, JOB_STATUS.cancelled] },
    })
      .populate(jobPopulate)
      .select('-__v')
      .lean(),
    query
  )
    .sort()
    .paginate()
    .fields();

  const [data, meta] = await Promise.all([jobQuery.modelQuery, jobQuery.countTotal()]);
  return { meta, data };
};

/** Returns jobs visible to admin or vendor. */
const getAllJobs = async (
  requester: TJobRequester,
  query: Record<string, unknown>
) => {
  const filter =
    requester.role === USER_ROLE.vendor ? { vendor: requester.userId } : {};
  const jobQuery = new QueryBuilder(
    Job.find(filter).populate(jobPopulate).select('-__v').lean(),
    query
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const [data, meta] = await Promise.all([jobQuery.modelQuery, jobQuery.countTotal()]);
  return { meta, data };
};

/** Returns one job after role-based access check. */
const getJobById = async (
  traceId: string,
  requester: TJobRequester,
  jobId: string
) => {
  const job = await Job.findById(jobId).populate(jobPopulate).select('-__v').lean();
  if (!job) throw new ApiError(HttpStatusCode.NotFound, 'Job not found', traceId);
  assertJobAccess(traceId, job as any, requester);
  return job;
};

/** Returns order's delivery job after access check. */
const getJobByOrderId = async (
  traceId: string,
  requester: TJobRequester,
  orderId: string
) => {
  const job = await Job.findOne({ order: orderId }).populate(jobPopulate).select('-__v').lean();
  if (!job) throw new ApiError(HttpStatusCode.NotFound, 'Job not found', traceId);
  assertJobAccess(traceId, job as any, requester);
  return job;
};

export const JobService = {
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
  getCurrentRiderJobs,
  getRiderHistory,
  getAllJobs,
  getJobById,
  getJobByOrderId,
};

