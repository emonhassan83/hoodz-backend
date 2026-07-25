import { compare, hash } from 'bcrypt';
import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { JOB_PAYMENT_METHOD, JOB_STATUS } from '@/app/modules/job/job.constant';
import { IJob } from '@/app/modules/job/job.interface';
import { Orders } from '@/app/modules/orders/orders.model';
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
export const assertJobAccess = (
  traceId: string,
  job: Pick<IJob, 'rider' | 'vendor' | 'assignedBy'>,
  requester: { userId: string; role: string }
) => {
  const userId = requester.userId;
  const canAccess =
    requester.role === USER_ROLE.admin ||
    String((job.rider as any)?._id ?? job.rider) === userId ||
    String((job.vendor as any)?._id ?? job.vendor) === userId ||
    String((job.assignedBy as any)?._id ?? job.assignedBy) === userId;

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

