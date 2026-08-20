import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { IJob } from '@/app/modules/job/job.interface';
import { Job } from '@/app/modules/job/job.model';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import { getIO } from '@/app/socket/socket.init';
import ackHandler from '@/app/socket/utils/ackHandler';

/** Sends a socket ack response when callback exists. */
export const sendJobAck = (
  callback: unknown,
  data: { success: boolean; status?: number; message?: string; data?: unknown }
) => {
  ackHandler(callback as any, data);
};

/** Throws when socket role does not match allowed roles. */
export const assertSocketRole = (
  role: string | undefined,
  allowedRoles: string[]
) => {
  if (!role || !allowedRoles.includes(role)) {
    throw new ApiError(HttpStatusCode.Forbidden, 'You are not authorized');
  }
};

/** Builds user ids that should receive job updates. */
export const getJobAudienceIds = async (jobId: string) => {
  const job = await Job.findById(jobId)
    .populate([{ path: 'order', select: 'user author' }])
    .select('rider user assignedBy requestedRider order')
    .lean();
  if (!job) return [];

  return [
    job.rider,
    job.user,
    ...(Array.isArray((job as any).requestedRider) ? (job as any).requestedRider : []),
    job.assignedBy,
    (job.order as any)?.user,
    (job.order as any)?.author,
  ]
    .filter(Boolean)
    .map((id) => String((id as any)?._id ?? id))
    .filter((value, index, arr) => arr.indexOf(value) === index);
};

/** Emits a job event to rider/vendor/customer/assigner rooms. */
export const emitJobToAudience = async (
  jobId: string,
  event: string,
  payload: unknown
) => {
  const io = getIO();
  const audienceIds = await getJobAudienceIds(jobId);
  audienceIds.forEach((userId) => io.to(userId).emit(event, payload));
};

/** Emits an event to explicit user rooms. */
export const emitToUserIds = (userIds: string[], event: string, payload: unknown) => {
  const io = getIO();
  [...new Set(userIds.filter(Boolean))].forEach((userId) => io.to(userId).emit(event, payload));
};

/** Returns job id from a populated or plain job result. */
export const resolveJobId = (job: unknown) => String((job as IJob)?._id ?? '');

/** Emits a platform-wide admin event using normal broadcast. */
export const emitToAdmins = (event: string, payload: unknown) => {
  getIO().emit(event, payload);
};

export const socketAdminRoles = [USER_ROLE.admin];
export const socketVendorAdminRoles = [USER_ROLE.vendor, USER_ROLE.admin];
export const socketAssignRoles = [USER_ROLE.vendor, USER_ROLE.admin, USER_ROLE.agent];
export const socketRiderRoles = [USER_ROLE.rider];

/** Private socket room for live order tracking. */
export const orderTrackRoom = (orderId: string) => `room_order_${orderId}`;

/** Leaves any previous order-tracking rooms on this socket. */
export const leaveOrderTrackRooms = (socket: { rooms: Set<string>; leave: (room: string) => void }) => {
  [...socket.rooms].forEach((room) => {
    if (room.startsWith('room_order_')) socket.leave(room);
  });
};

/** Returns the customer user id from a job payload. */
export const getJobCustomerId = (job: any) => {
  const customerId = String(
    (job?.user as any)?._id ??
      job?.user ??
      (job?.order as any)?.user?._id ??
      (job?.order as any)?.user ??
      ''
  );
  return customerId && customerId !== 'undefined' ? customerId : '';
};

/** Broadcasts a delivery-status event to the customer and order track room. */
export const notifyJobOrderStatus = async (job: any, event: string) => {
  const orderId = String((job?.order as any)?._id ?? job?.order ?? '');
  const customerId = getJobCustomerId(job);

  if (customerId) {
    emitToUserIds([customerId], event, job);
  }

  if (orderId) {
    getIO().to(orderTrackRoom(orderId)).emit(event, job);
  }
};
export const emitOrderTrackLocation = (
  orderId: string,
  payload: {
    lat: number;
    lng: number;
    speed: number;
    heading: number;
    encodedRoute: string;
  }
) => {
  getIO().to(orderTrackRoom(orderId)).emit(SOCKET_EMIT.orderLocation, payload);
};



