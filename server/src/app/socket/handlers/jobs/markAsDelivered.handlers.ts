import { JOB_PAYMENT_METHOD } from '@/app/modules/job/job.constant';
import { TJobIdSocketPayload } from '@/app/socket/interface/jobSocket.interface';
import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import eventHandler from '@/app/socket/utils/eventHandler';
import { JobSocketActions } from '@/app/socket/utils/jobSocket.actions';
import {
  assertSocketRole,
  emitJobToAudience,
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

    await emitJobToAudience(jobId, SOCKET_EMIT.jobDelivered, data);
    await emitJobToAudience(jobId, SOCKET_EMIT.jobUpdated, data);
    if ((data as any)?.paymentMethod === JOB_PAYMENT_METHOD.cod) {
      await emitJobToAudience(jobId, SOCKET_EMIT.depositPending, data);
    }

    sendJobAck(callback, {
      success: true,
      status: 200,
      message: 'Job marked as delivered',
      data,
    });
  }
);
