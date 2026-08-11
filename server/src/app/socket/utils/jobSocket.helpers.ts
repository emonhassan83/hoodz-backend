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
    .select('rider assignedBy order')
    .lean();
  if (!job) return [];

  return [
    job.rider,
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

/** Returns job id from a populated or plain job result. */
export const resolveJobId = (job: unknown) => String((job as IJob)?._id ?? '');

/** Emits a platform-wide admin event using normal broadcast. */
export const emitToAdmins = (event: string, payload: unknown) => {
  getIO().emit(event, payload);
};

export const socketAdminRoles = [USER_ROLE.admin];
export const socketVendorAdminRoles = [USER_ROLE.vendor, USER_ROLE.admin];
export const socketRiderRoles = [USER_ROLE.rider];



