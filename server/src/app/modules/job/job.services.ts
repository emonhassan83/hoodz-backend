import { HttpStatusCode } from 'axios';
import mongoose from 'mongoose';

import QueryBuilder from '@/app/builder/QueryBuilder';
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
  assertRequestedOrAssignedRider,
  buildJobLocations,
  buildJobMoneyFields,
  collectNearbyRequestedRiders,
  compareDeliveryOtp,
  deleteDeliveryOtpFromRedis,
  generateDeliveryOtp,
  getAssignableOrderOrThrow,
  getAssignableRiderOrThrow,
  getDeliveryOtpFromRedis,
  getRiderMatchSettings,
  hashDeliveryOtp,
  isReassignableJob,
  notifyJobOffer,
  notifyJobRequestCancelled,
  notifyJobRiderAssigned,
  notifyMatchingExhausted,
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
import { notifyOrderUser } from '@/app/modules/orders/orders.helpers';
import { Orders } from '@/app/modules/orders/orders.model';
import { Payment } from '@/app/modules/payment/payment.model';
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
  { path: 'user', select: 'name email phone profileAvatar' },
  { path: 'requestedRider', select: 'name email phone profileAvatar' },
  { path: 'assignedBy', select: 'name email role' },
];

/** Marks rider online for delivery jobs. */
const riderGoOnline = async (
  traceId: string,
  riderId: string,
  payload: TGeoPayload
) => {
  const geo = normalizeRiderGeo(payload);
  if (!geo) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Rider latitude and longitude are required',
      traceId
    );
  }
  return RiderAvailabilitySocketHelper.goOnline(traceId, riderId, geo);
};

/** Marks rider offline for delivery jobs. */
const riderGoOffline = async (riderId: string, payload?: TGeoPayload) =>
  RiderAvailabilitySocketHelper.goOffline(riderId, normalizeRiderGeo(payload));

/** Finds nearby online riders for a vendor/admin order assignment. */
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
      : requester.role === USER_ROLE.agent
        ? JOB_ASSIGNMENT_TYPE.agent
        : JOB_ASSIGNMENT_TYPE.vendor);

  const previousRiderIds = (existingJob?.requestedRider ?? []).map((rider) =>
    rider.toString()
  );
  const orderUserId = (order.user as any)?._id ?? order.user ?? null;

  const job = await Job.findOneAndUpdate(
    { order: payload.orderId },
    {
      order: payload.orderId,
      user: orderUserId,
      rider: payload.riderId,
      requestedRider: [payload.riderId],
      assignedBy:
        assignmentType === JOB_ASSIGNMENT_TYPE.auto ? null : requester.userId,
      assignmentType,
      paymentMethod,
      deliveryType: order.deliveryType,
      matchingEnabled: false,
      nextMatchAt: null,
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

  const leftoverRiders = previousRiderIds.filter((id) => id !== payload.riderId);
  await notifyJobRequestCancelled(job, leftoverRiders);
  await notifyJobRiderAssigned(job, leftoverRiders);
  await notifyOrderUser(job?.order as any, 'rider_assigned');

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
  assertRequestedOrAssignedRider(traceId, job, riderId);
  assertJobStatusIn(traceId, job, [JOB_STATUS.assigned], 'Only assigned jobs can be accepted');

  if (job.rider && job.rider.toString() !== riderId) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Job already accepted', traceId);
  }

  const previousRiderIds = (job.requestedRider ?? []).map((rider) => rider.toString());
  const claimed = await Job.findOneAndUpdate(
    job.rider
      ? { _id: job._id, rider: riderId, status: JOB_STATUS.assigned }
      : {
          _id: job._id,
          rider: null,
          status: JOB_STATUS.assigned,
          requestedRider: riderId,
        },
    {
      rider: riderId,
      status: JOB_STATUS.accepted,
      acceptedAt: new Date(),
      matchingEnabled: false,
      nextMatchAt: null,
    },
    { new: true }
  ).populate(jobPopulate);

  if (!claimed) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Job already accepted', traceId);
  }

  await Promise.all([
    RiderAvailabilitySocketHelper.setActiveJob(riderId, claimed._id.toString()),
    Orders.findByIdAndUpdate(claimed.order, { status: ORDER_STATUS.rider_assigned }),
  ]);

  const leftoverRiders = previousRiderIds.filter((id) => id !== riderId);
  await notifyJobRequestCancelled(claimed, leftoverRiders);
  await notifyJobRiderAssigned(claimed, leftoverRiders);
  await notifyOrderUser(claimed.order as any, 'rider_assigned');

  return claimed;
};

/** Rider rejects their assigned job and releases availability. */
const rejectJob = async (
  traceId: string,
  riderId: string,
  payload: TRejectJobPayload
) => {
  const job = await Job.findById(payload.jobId);
  if (!job) throw new ApiError(HttpStatusCode.NotFound, 'Job not found', traceId);
  assertRequestedOrAssignedRider(traceId, job, riderId);
  assertJobStatusIn(traceId, job, [JOB_STATUS.assigned], 'Only assigned jobs can be rejected');

  if (!job.rider) {
    job.requestedRider = (job.requestedRider ?? []).filter(
      (rider) => rider.toString() !== riderId
    );
    await job.save();
    const remaining = await Job.findById(job._id).populate(jobPopulate);
    if (job.matchingEnabled && !(job.requestedRider ?? []).length) {
      await rematchJob(traceId, job._id.toString());
      return Job.findById(job._id).populate(jobPopulate);
    }
    return remaining;
  }

  job.status = JOB_STATUS.rejected;
  job.matchingEnabled = false;
  job.nextMatchAt = null;
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
  const populatedJob = await Job.findById(job._id).populate(jobPopulate);
  const sms = await sendDeliveryOtpSms(
    traceId,
    (populatedJob?.order as any)?.billingDetails?.phoneNumber,
    otp
  );

  return {
    job: populatedJob,
    jobId: job._id,
    otp,
    mock: sms.mock,
  };
};

/** Verifies customer delivery OTP and marks order OTP verified. */
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

/** Updates live rider location while idle or on a job. */
const riderLocationUpdate = async (
  traceId: string,
  riderId: string,
  payload: TRiderLocationUpdatePayload
) => {
  let activeJob = payload.jobId ?? null;
  if (payload.jobId) {
    const job = await Job.findById(payload.jobId);
    if (!job) throw new ApiError(HttpStatusCode.NotFound, 'Job not found', traceId);
    assertAssignedRider(traceId, job, riderId);
    activeJob = payload.jobId;
  }

  const geo = normalizeRiderGeo(payload);
  if (!geo) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Rider latitude and longitude are required',
      traceId
    );
  }

  const availability = await RiderAvailabilitySocketHelper.updateLocation(riderId, {
    latitude: geo.latitude,
    longitude: geo.longitude,
    heading: geo.heading,
    activeJob: activeJob ?? undefined,
  });

  return {
    jobId: activeJob || availability?.activeJob || null,
    riderId,
    availability,
  };
};

/** Returns rider current active jobs. */
const getCurrentRiderJobs = async (riderId: string, query: Record<string, unknown>) => {
  const jobQuery = new QueryBuilder(
    Job.find({
      status: { $nin: [JOB_STATUS.delivered, JOB_STATUS.rejected, JOB_STATUS.cancelled] },
      $or: [{ rider: riderId }, { rider: null, requestedRider: riderId }],
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
    requester.role === USER_ROLE.vendor
      ? { order: { $in: await Orders.distinct('_id', { author: requester.userId }) } }
      : {};
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
  await assertJobAccess(traceId, job as any, requester);
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
  await assertJobAccess(traceId, job as any, requester);
  return job;
};

/** Creates an unmatched job and offers it to nearby online riders. */
const startJobMatching = async (traceId: string, orderId: string) => {
  const order = await getAssignableOrderOrThrow(traceId, orderId);
  const existingJob = await Job.findOne({
    order: orderId,
    status: { $nin: [JOB_STATUS.delivered, JOB_STATUS.cancelled] },
  });
  if (existingJob && existingJob.rider) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'This order already has an assigned rider',
      traceId
    );
  }
  if (
    existingJob &&
    existingJob.matchingEnabled &&
    (existingJob.matchAttemptCount ?? 0) > 0
  ) {
    return Job.findById(existingJob._id).populate(jobPopulate);
  }

  assertShopAndDeliveryLocations(traceId, order);

  const payment = await Payment.findOne({ order: orderId, isDeleted: false })
    .select('paymentMethod')
    .sort({ createdAt: -1 })
    .lean();
  const paymentMethod =
    payment?.paymentMethod &&
    Object.values(JOB_PAYMENT_METHOD).includes(payment.paymentMethod as any)
      ? (payment.paymentMethod as (typeof JOB_PAYMENT_METHOD)[keyof typeof JOB_PAYMENT_METHOD])
      : JOB_PAYMENT_METHOD.card;
  const moneyFields = buildJobMoneyFields(
    paymentMethod,
    order.totalAmount,
    order.deliveryCharge
  );
  const locationFields = buildJobLocations(order);
  const orderUserId = (order.user as any)?._id ?? order.user ?? null;

  const job = await Job.findOneAndUpdate(
    { order: orderId },
    {
      order: orderId,
      user: orderUserId,
      rider: null,
      requestedRider: existingJob?.requestedRider ?? [],
      assignedBy: null,
      assignmentType: JOB_ASSIGNMENT_TYPE.auto,
      paymentMethod,
      deliveryType: order.deliveryType,
      matchingEnabled: true,
      matchAttemptCount: existingJob?.matchAttemptCount ?? 0,
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
  );

  return applyMatchRound(traceId, job!._id.toString());
};

const assertShopAndDeliveryLocations = (traceId: string, order: any) => {
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

async function exhaustMatching(jobId: string) {
  const job = await Job.findOneAndUpdate(
    { _id: jobId, rider: null, matchingEnabled: true },
    { matchingEnabled: false, nextMatchAt: null },
    { new: true }
  ).populate(jobPopulate);
  if (job) await notifyMatchingExhausted(job);
  return job;
}

async function applyMatchRound(traceId: string, jobId: string) {
  const job = await Job.findById(jobId);
  if (!job || job.rider || !job.matchingEnabled || job.status !== JOB_STATUS.assigned) {
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
  const previousRiderIds = (job.requestedRider ?? []).map((rider) => rider.toString());
  const requestedRider = await collectNearbyRequestedRiders(latitude, longitude);
  const now = new Date();
  const nextMatchAt = new Date(now.getTime() + settings.intervalSeconds * 1000);

  const updated = await Job.findOneAndUpdate(
    {
      _id: jobId,
      rider: null,
      matchingEnabled: true,
      status: JOB_STATUS.assigned,
    },
    {
      requestedRider,
      user: (order.user as any)?._id ?? order.user ?? job.user,
      matchAttemptCount: (job.matchAttemptCount ?? 0) + 1,
      lastMatchedAt: now,
      nextMatchAt,
    },
    { new: true }
  ).populate(jobPopulate);

  if (!updated) return Job.findById(jobId).populate(jobPopulate);

  const newRiderIds = requestedRider.map((rider) => rider.toString());
  const droppedRiderIds = previousRiderIds.filter((id) => !newRiderIds.includes(id));
  await notifyJobRequestCancelled(updated, droppedRiderIds);
  await notifyJobOffer(updated, newRiderIds);
  return updated;
}

async function rematchJob(traceId: string, jobId: string) {
  return applyMatchRound(traceId, jobId);
}

/** Rematches unmatched jobs whose nextMatchAt has elapsed. */
const rematchDueJobs = async (traceId = 'cron') => {
  const settings = await getRiderMatchSettings();
  const dueJobs = await Job.find({
    matchingEnabled: true,
    rider: null,
    status: JOB_STATUS.assigned,
    nextMatchAt: { $lte: new Date() },
  }).select('_id matchAttemptCount order');

  let rematched = 0;
  let exhausted = 0;
  for (const job of dueJobs) {
    const order = await Orders.findById(job.order).select('status isDeleted');
    if (!order || order.isDeleted || order.status === ORDER_STATUS.cancelled) {
      await exhaustMatching(job._id.toString());
      exhausted += 1;
      continue;
    }
    if ((job.matchAttemptCount ?? 0) >= settings.maxAttempts) {
      await exhaustMatching(job._id.toString());
      exhausted += 1;
      continue;
    }
    await applyMatchRound(traceId, job._id.toString());
    rematched += 1;
  }

  return { rematched, exhausted, scanned: dueJobs.length };
};

/** Flushes online rider Redis points into User.lastAvailable. */
const persistOnlineRiderLocations = async () =>
  RiderAvailabilitySocketHelper.persistOnlineRiderLocations();

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
  startJobMatching,
  rematchDueJobs,
  persistOnlineRiderLocations,
};


