import { JOB_PAYMENT_METHOD } from '@/app/modules/job/job.constant';
import { TJobIdSocketPayload } from '@/app/socket/interface/jobSocket.interface';
import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import eventHandler from '@/app/socket/utils/eventHandler';
import { JobSocketActions } from '@/app/socket/utils/jobSocket.actions';
import {
  assertSocketRole,
  emitToUserIds,
  getJobAudienceIds,
  getJobCustomerId,
  notifyJobOrderStatus,
  resolveJobId,
  sendJobAck,
  socketRiderRoles,
} from '@/app/socket/utils/jobSocket.helpers';

export const markAsDeliveredHandler = eventHandler<TJobIdSocketPayload>(
  async (socket: TSocket, payload, callback) => {
    assertSocketRole(socket.auth.role, socketRiderRoles);
    if (!payload?.jobId) {
      sendJobAck(callback, {
        success: false,
        status: 400,
        message: 'jobId is required',
      });
      return;
    }

    const data = await JobSocketActions.deliveredJob(
      'socket',
      socket.auth._id,
      payload
    );
    const jobId = resolveJobId(data);

    await notifyJobOrderStatus(data, SOCKET_EMIT.jobDelivered);
    if ((data as any)?.paymentMethod === JOB_PAYMENT_METHOD.cod) {
      const riderId = socket.auth._id.toString();
      const audienceIds = (await getJobAudienceIds(jobId)).filter(
        (id) => id !== riderId
      );
      emitToUserIds(audienceIds, SOCKET_EMIT.depositPending, data);
    }

    const customerId = getJobCustomerId(data);
    if (customerId && customerId !== 'undefined') {
      emitToUserIds([customerId], SOCKET_EMIT.rideRequestRating, {
        jobId,
        jobPublicId: (data as any)?.id,
        rider: (data as any)?.rider,
        order: (data as any)?.order,
      });
    }

    sendJobAck(callback, {
      success: true,
      status: 200,
      message: 'Job marked as delivered',
      data,
    });
  }
);
