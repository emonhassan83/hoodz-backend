import { compare, hash } from 'bcrypt';
import { HttpStatusCode } from 'axios';
import twilio from 'twilio';

import { env } from '@/app/configs/env.configs';
import ApiError from '@/app/errors/ApiError';
import { getRedisClient } from '@/app/configs/redis.config';
import { JOB_PAYMENT_METHOD, JOB_STATUS } from '@/app/modules/job/job.constant';
import { IJob } from '@/app/modules/job/job.interface';
import { Orders } from '@/app/modules/orders/orders.model';
import { REDIS_KEYS } from '@/app/redis/keys';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import { User } from '@/app/modules/user/user.model';

/** Returns a random 6-digit delivery OTP. */
export const generateDeliveryOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

/** Hashes delivery OTP before storing it. */
export const hashDeliveryOtp = async (otp: string) => hash(otp, 10);

/** Compares delivery OTP with stored hash. */
export const compareDeliveryOtp = async (otp: string, hashedOtp: string) =>
  compare(otp, hashedOtp);

/** Stores delivery OTP hash in Redis for a short handoff window. */
export const saveDeliveryOtpToRedis = async (
  jobId: string,
  hashedOtp: string,
  ttlSeconds = env.DELIVERY_OTP_TTL_SECONDS ?? 300
) => {
  await getRedisClient().set(REDIS_KEYS.DELIVERY_OTP(jobId), hashedOtp, 'EX', ttlSeconds);
};

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
      body: `Your Hoodz delivery OTP is ${otp}. It expires in 5 minutes. Please do not share it.`,
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
  const isVendorOwner =
    String((order.author as any)?._id ?? order.author) === requester.userId;

  if (!isAdmin && !isVendorOwner) {
    throw new ApiError(HttpStatusCode.Forbidden, 'You cannot assign this order', traceId);
  }
};

/** Throws unless requester can access a job. */
export const assertJobAccess = async (
  traceId: string,
  job: Pick<IJob, 'rider' | 'assignedBy' | 'order'>,
  requester: { userId: string; role: string }
) => {
  const userId = requester.userId;
  const orderId = String((job.order as any)?._id ?? job.order);
  const isVendorOrder =
    requester.role === USER_ROLE.vendor &&
    Boolean(await Orders.exists({ _id: orderId, author: userId }));
  const canAccess =
    requester.role === USER_ROLE.admin ||
    String((job.rider as any)?._id ?? job.rider) === userId ||
    String((job.assignedBy as any)?._id ?? job.assignedBy) === userId ||
    isVendorOrder;

  if (!canAccess) {
    throw new ApiError(HttpStatusCode.Forbidden, 'You cannot access this job', traceId);
  }
};

/** Throws unless requester is the rider assigned to this job. */
export const assertAssignedRider = (
  traceId: string,
  job: Pick<IJob, 'rider'>,
  riderId: string
) => {
  if (job.rider.toString() !== riderId) {
    throw new ApiError(HttpStatusCode.Forbidden, 'This job is not assigned to you', traceId);
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
  const rider = await User.findOne({
    _id: riderId,
    role: USER_ROLE.rider,
    isDeleted: false,
  }).select('status');
  if (!rider) {
    throw new ApiError(HttpStatusCode.NotFound, 'Rider not found', traceId);
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

/** Builds pickup/destination snapshots from order/vendor/user data. */
export const buildJobLocations = (order: any) => {
  const vendor = order.author;
  const customer = order.user;
  const pickupCoordinates = vendor?.location?.coordinates ?? [0, 0];
  const destinationCoordinates =
    customer?.deliveryLocation?.coordinates ??
    customer?.location?.coordinates ??
    [0, 0];

  return {
    pickup: {
      address: vendor?.address || 'Vendor address',
      coordinates: pickupCoordinates,
    },
    destination: {
      address:
        order.billingDetails?.address ||
        customer?.deliveryAddress ||
        customer?.address ||
        'Customer address',
      coordinates: destinationCoordinates,
    },
  };
};

/** Returns true when a job can be replaced by a new assignment. */
export const isReassignableJob = (status: string) =>
  [JOB_STATUS.assigned, JOB_STATUS.rejected, JOB_STATUS.cancelled].includes(
    status as any
  );


