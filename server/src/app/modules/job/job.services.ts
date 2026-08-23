import { HttpStatusCode } from 'axios';
import mongoose from 'mongoose';

import QueryBuilder from '@/app/builder/QueryBuilder';
import { JOB_ASSIGNMENT_TYPE } from '@/app/constant';
import ApiError from '@/app/errors/ApiError';
import {
  JOB_DEPOSIT_STATUS,
  JOB_PAYMENT_METHOD,
  JOB_STATUS,
} from '@/app/modules/job/job.constant';
import {
  applyJobListQueryFilters,
  applyMatchRound,
  assertAssignedRider,
  assertCanAssignOrder,
  assertJobAccess,
  assertJobStatusIn,
  assertRequestedOrAssignedRider,
  assertShopAndDeliveryLocations,
  buildJobLocationFields,
  buildJobMoneyFields,
  compareDeliveryOtp,
  createDeliveryOtpToken,
  deleteDeliveryOtpFromRedis,
  exhaustMatching,
  generateDeliveryOtp,
  getAssignableOrderOrThrow,
  getAssignableRiderOrThrow,
  getCustomerDeliveryPhone,
  getDeliveryOtpFromRedis,
  getRiderMatchSettings,
  hashDeliveryOtp,
  isReassignableJob,
  jobListCardSelect,
  jobPopulate,
  mapJobsToListCards,
  notifyJobAssignedToRider,
  notifyJobRiderAssigned,
  notifyOtherRidersJobTaken,
  resolveOrderPaymentMethod,
  riderRequestJobFilter,
  saveDeliveryOtpToRedis,
  sendDeliveryOtpSms,
  stripJobListQueryParams,
  toRiderObjectId,
  verifyDeliveryOtpToken,
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
import {
  ORDER_STATUS,
  PAYMENT_STATUS as ORDER_PAYMENT_STATUS,
} from '@/app/modules/orders/orders.constant';
import {
  getOrderStatusTimestampUpdate,
  notifyOrderUser,
} from '@/app/modules/orders/orders.helpers';
import { Orders } from '@/app/modules/orders/orders.model';
import { PAYMENT_METHOD, PAYMENT_STATUS } from '@/app/modules/payment/payment.constant';
import { Payment } from '@/app/modules/payment/payment.model';
import { User } from '@/app/modules/user/user.model';
import {
  RiderAvailabilitySocketHelper,
  normalizeRiderGeo,
} from '@/app/socket/utils/riderAvailability.helpers';

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
const riderGoOffline = async (
  traceId: string,
  riderId: string,
  payload?: TGeoPayload
) => {
  const geo = normalizeRiderGeo(payload);
  if (!geo) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Rider latitude and longitude are required',
      traceId
    );
  }
  return RiderAvailabilitySocketHelper.goOffline(traceId, riderId, geo);
};

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

  const paymentMethod =
    payload.paymentMethod ?? (await resolveOrderPaymentMethod(payload.orderId));
  const moneyFields = buildJobMoneyFields(
    paymentMethod,
    order.totalAmount,
    order.deliveryCharge
  );
  const locationFields = await buildJobLocationFields(order);
  const assignmentType = payload.assignmentType ?? JOB_ASSIGNMENT_TYPE.agent;

  const previousRiderIds = [
    ...new Set([
      ...(existingJob?.requestedRider ?? []).map((rider) => rider.toString()),
      ...(existingJob?.offeredRider ?? []).map((rider) => rider.toString()),
    ]),
  ];
  const orderUserId = (order.user as any)?._id ?? order.user ?? null;

  const job = await Job.findOneAndUpdate(
    { order: payload.orderId },
    {
      order: payload.orderId,
      user: orderUserId,
      rider: payload.riderId,
      requestedRider: [],
      offeredRider: [],
      declinedRider: [],
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
    Orders.findByIdAndUpdate(payload.orderId, {
      status: ORDER_STATUS.rider_assigned,
      ...getOrderStatusTimestampUpdate(ORDER_STATUS.rider_assigned),
    }),
    RiderAvailabilitySocketHelper.setActiveJob(payload.riderId, job!._id.toString()),
  ]);

  const assignedJob = await Job.findById(job!._id).populate(jobPopulate);
  const leftoverRiders = previousRiderIds.filter((id) => id !== payload.riderId);
  await notifyOtherRidersJobTaken(assignedJob, leftoverRiders);
  await notifyJobAssignedToRider(assignedJob, payload.riderId);
  await notifyJobRiderAssigned(assignedJob);
  await notifyOrderUser(assignedJob?.order as any, 'rider_assigned');

  return assignedJob;
};

/** Rider accepts a matching or assigned job. */
const acceptJob = async (
  traceId: string,
  riderId: string,
  payload: TJobIdPayload
) => {
  const job = await Job.findById(payload.jobId);
  if (!job) throw new ApiError(HttpStatusCode.NotFound, 'Job not found', traceId);
  assertRequestedOrAssignedRider(traceId, job, riderId);
  assertJobStatusIn(
    traceId,
    job,
    [JOB_STATUS.matching, JOB_STATUS.assigned],
    'Only matching or assigned jobs can be accepted'
  );

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
          status: { $in: [JOB_STATUS.matching, JOB_STATUS.assigned] },
          $or: [{ requestedRider: riderId }, { offeredRider: riderId }],
        },
    {
      rider: riderId,
      requestedRider: [],
      offeredRider: [],
      declinedRider: [],
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

  const acceptedJob = await Job.findById(claimed._id).populate(jobPopulate);
  const leftoverRiders = previousRiderIds.filter((id) => id !== riderId);
  await notifyOtherRidersJobTaken(acceptedJob, leftoverRiders);
  await notifyJobRiderAssigned(acceptedJob, leftoverRiders);
  await notifyOrderUser(acceptedJob?.order as any, 'rider_assigned');

  return acceptedJob;
};

/** Rider declines an offer; only removes them from requestedRider. */
const rejectJob = async (
  traceId: string,
  riderId: string,
  payload: TRejectJobPayload
) => {
  const job = await Job.findById(payload.jobId);
  if (!job) throw new ApiError(HttpStatusCode.NotFound, 'Job not found', traceId);
  assertRequestedOrAssignedRider(traceId, job, riderId);
  assertJobStatusIn(
    traceId,
    job,
    [JOB_STATUS.matching, JOB_STATUS.assigned],
    'This job cannot be rejected now'
  );

  const wasAssignedRider = job.rider?.toString() === riderId;
  await Job.findByIdAndUpdate(
    job._id,
    wasAssignedRider
      ? {
          $pull: { requestedRider: riderId },
          $addToSet: { declinedRider: riderId },
          rider: null,
          status: JOB_STATUS.matching,
          matchingEnabled: true,
          rejectionReason: payload.reason ?? null,
        }
      : {
          $pull: { requestedRider: riderId },
          $addToSet: { declinedRider: riderId },
        }
  );

  if (wasAssignedRider) {
    await RiderAvailabilitySocketHelper.setActiveJob(riderId, null);
  }

  const remaining = await Job.findById(job._id).populate(jobPopulate);
  const remainingIds = (remaining?.requestedRider ?? []).map((rider: any) =>
    String(rider?._id ?? rider)
  );
  if (
    remaining?.matchingEnabled &&
    remaining.status === JOB_STATUS.matching &&
    !remaining.rider &&
    !remainingIds.length
  ) {
    await applyMatchRound(traceId, job._id.toString());
    return Job.findById(job._id).populate(jobPopulate);
  }

  return remaining;
};

/** Marks package pickup complete and updates order. */
const pickupJob = async (traceId: string, riderId: string, payload: TJobIdPayload) => {
  const job = await Job.findById(payload.jobId);
  if (!job) throw new ApiError(HttpStatusCode.NotFound, 'Job not found', traceId);
  assertAssignedRider(traceId, job, riderId);
  assertJobStatusIn(
    traceId,
    job,
    [JOB_STATUS.assigned, JOB_STATUS.accepted],
    'Job cannot be picked up now'
  );

  if (!job.acceptedAt) job.acceptedAt = new Date();
  job.status = JOB_STATUS.picked_up;
  job.pickedUpAt = new Date();
  await job.save();
  await Orders.findByIdAndUpdate(job.order, { status: ORDER_STATUS.picked_up });
  const pickedUpJob = await Job.findById(job._id).populate(jobPopulate);
  await notifyOrderUser(pickedUpJob?.order as any, 'picked_up');
  return pickedUpJob;
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
  const onTheWayJob = await Job.findById(job._id).populate(jobPopulate);
  await notifyOrderUser(onTheWayJob?.order as any, 'on_the_way');
  return onTheWayJob;
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
  const populatedJob = await Job.findById(job._id).populate([
    ...jobPopulate,
    {
      path: 'order',
      select:
        'id user author totalAmount deliveryCharge status paymentStatus billingDetails deliveryType isOtpVerified',
      populate: [{ path: 'user', select: 'phone' }],
    },
  ]);
  const sms = await sendDeliveryOtpSms(
    traceId,
    getCustomerDeliveryPhone(populatedJob?.order),
    otp
  );
  const isMock = sms.mock;

  return {
    job: populatedJob,
    jobId: job._id,
    verificationToken: createDeliveryOtpToken(job._id.toString()),
    otp: isMock ? otp : null,
    mock: isMock,
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
  if (payload.verificationToken) {
    const decoded = verifyDeliveryOtpToken(payload.verificationToken, traceId);
    if (decoded.jobId !== job._id.toString()) {
      throw new ApiError(HttpStatusCode.BadRequest, 'Invalid OTP verification token', traceId);
    }
  }
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
    if (job.paymentMethod === JOB_PAYMENT_METHOD.cod) {
      job.collectedMoney = Number((order.totalAmount ?? 0).toFixed(2));
      job.depositStatus = JOB_DEPOSIT_STATUS.pending;
      order.paymentStatus = ORDER_PAYMENT_STATUS.paid;
      await Payment.updateMany(
        {
          order: order._id,
          paymentMethod: PAYMENT_METHOD.cod,
          isDeleted: { $ne: true },
        },
        {
          status: PAYMENT_STATUS.paid,
          isPaid: true,
        },
        { session }
      );
    } else {
      const earning = Number((job.earning ?? 0).toFixed(2));
      if (earning > 0) {
        await User.findByIdAndUpdate(
          riderId,
          { $inc: { balance: earning } },
          { session }
        );
      }
    }
    await job.save({ session });

    order.status = ORDER_STATUS.delivered;
    await order.save({ session });

    await session.commitTransaction();
    await RiderAvailabilitySocketHelper.setActiveJob(riderId, null);

    const delivered = await Job.findById(job._id).populate(jobPopulate);
    await notifyOrderUser(delivered?.order as any, 'delivered');
    return delivered;
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
  const geo = normalizeRiderGeo(payload);
  if (!geo) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Rider latitude and longitude are required',
      traceId
    );
  }

  let job = payload.jobId
    ? await Job.findById(payload.jobId).select('order rider status').lean()
    : null;
  if (payload.jobId) {
    if (!job) throw new ApiError(HttpStatusCode.NotFound, 'Job not found', traceId);
    assertAssignedRider(traceId, job, riderId);
  }

  const availability = await RiderAvailabilitySocketHelper.updateLocation(riderId, {
    latitude: geo.latitude,
    longitude: geo.longitude,
    heading: geo.heading,
    activeJob: job?._id.toString() ?? undefined,
  });

  if (!job) {
    const jobId = availability?.activeJob || null;
    job = jobId
      ? await Job.findById(jobId).select('order rider status').lean()
      : await Job.findOne({
          rider: riderId,
          status: { $ne: JOB_STATUS.delivered },
        })
          .select('order rider status')
          .lean();
  }

  const heading = Number.isFinite(Number(geo.heading)) ? Number(geo.heading) : 0;
  const speed = Number.isFinite(Number(payload.speed)) ? Number(payload.speed) : 0;

  return {
    jobId: job?._id.toString() ?? null,
    orderId: job?.order?.toString() ?? null,
    riderId,
    availability,
    lat: geo.latitude,
    lng: geo.longitude,
    speed,
    heading,
    encodedRoute: typeof payload.encodedRoute === 'string' ? payload.encodedRoute : '',
  };
};

/** Returns matching jobs where this rider is in requestedRider. */
const myRequestJobs = async (riderId: string, query: Record<string, unknown>) => {
  const filter = applyJobListQueryFilters(riderRequestJobFilter(riderId), query);
  const jobQuery = new QueryBuilder(
    Job.find(filter).select(jobListCardSelect).lean(),
    stripJobListQueryParams(query)
  )
    .sort()
    .paginate();

  const [jobs, meta] = await Promise.all([jobQuery.modelQuery, jobQuery.countTotal()]);
  return { meta, data: await mapJobsToListCards(jobs) };
};

/** Returns the rider's assigned jobs, filtered as active or completed. */
const getMyJobs = async (riderId: string, query: Record<string, unknown>) => {
  const rider = toRiderObjectId(riderId);
  const filter = applyJobListQueryFilters(
    { $or: [{ rider }, { rider: riderId }] },
    query
  );

  const jobQuery = new QueryBuilder(
    Job.find(filter).select(jobListCardSelect).lean(),
    stripJobListQueryParams(query)
  )
    .sort()
    .paginate();

  const [jobs, meta] = await Promise.all([jobQuery.modelQuery, jobQuery.countTotal()]);
  return { meta, data: await mapJobsToListCards(jobs) };
};

/** Returns every job for a rider. Used by agents. */
const getRiderJobs = async (riderId: string, query: Record<string, unknown>) => {
  const filter = applyJobListQueryFilters(
    { $or: [{ rider: riderId }, { requestedRider: riderId }] },
    query
  );

  const jobQuery = new QueryBuilder(
    Job.find(filter).select(jobListCardSelect).lean(),
    stripJobListQueryParams(query)
  )
    .sort()
    .paginate();

  const [jobs, meta] = await Promise.all([jobQuery.modelQuery, jobQuery.countTotal()]);
  return { meta, data: await mapJobsToListCards(jobs) };
};

/** Returns one job after role-based access check. */
const getAJobDetails = async (
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
    status: { $ne: JOB_STATUS.delivered },
  });
  if (existingJob && existingJob.rider) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'This order already has an assigned rider',
      traceId
    );
  }
  const paymentMethod = await resolveOrderPaymentMethod(orderId);
  if (
    existingJob &&
    existingJob.matchingEnabled &&
    (existingJob.matchAttemptCount ?? 0) > 0
  ) {
    if (existingJob.paymentMethod !== paymentMethod) {
      await Job.findByIdAndUpdate(existingJob._id, {
        paymentMethod,
        ...buildJobMoneyFields(
          paymentMethod,
          order.totalAmount,
          order.deliveryCharge
        ),
      });
    }
    return Job.findById(existingJob._id).populate(jobPopulate);
  }

  assertShopAndDeliveryLocations(traceId, order);
  const moneyFields = buildJobMoneyFields(
    paymentMethod,
    order.totalAmount,
    order.deliveryCharge
  );
  const locationFields = await buildJobLocationFields(order);
  const orderUserId = (order.user as any)?._id ?? order.user ?? null;

  const job = await Job.findOneAndUpdate(
    { order: orderId },
    {
      order: orderId,
      user: orderUserId,
      rider: null,
      requestedRider: existingJob?.requestedRider ?? [],
      declinedRider: existingJob?.declinedRider ?? [],
      offeredRider: existingJob?.offeredRider ?? [],
      assignedBy: null,
      assignmentType: JOB_ASSIGNMENT_TYPE.auto,
      paymentMethod,
      deliveryType: order.deliveryType,
      matchingEnabled: true,
      matchAttemptCount: existingJob?.matchAttemptCount ?? 0,
      ...locationFields,
      ...moneyFields,
      hasDeliveryOtpVerified: false,
      status: JOB_STATUS.matching,
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

/** Rematches unmatched jobs whose nextMatchAt has elapsed. */
const rematchDueJobs = async (traceId = 'cron') => {
  const settings = await getRiderMatchSettings();
  const dueJobs = await Job.find({
    matchingEnabled: true,
    rider: null,
    status: { $in: [JOB_STATUS.matching, JOB_STATUS.assigned] },
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
  pickupJob,
  onTheWay,
  sendDeliveryOtp,
  verifyDeliveryOtp,
  deliveredJob,
  riderLocationUpdate,
  myRequestJobs,
  getMyJobs,
  getRiderJobs,
  getAJobDetails,
  getJobByOrderId,
  startJobMatching,
  rematchDueJobs,
  persistOnlineRiderLocations,
};


