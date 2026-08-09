import { JOB_PAYMENT_METHOD } from '@/app/modules/job/job.constant';
import { JobService } from '@/app/modules/job/job.services';
import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import eventHandler from '@/app/socket/utils/eventHandler';
import {
  assertSocketRole,
  emitJobToAudience,
  resolveJobId,
  sendJobAck,
  socketRiderRoles,
} from '@/app/socket/utils/jobSocket.helpers';

type TJobDeliveredPayload = {
  jobId: string;
};

export const jobDeliveredHandler = eventHandler<TJobDeliveredPayload>(
  async (socket: TSocket, payload, callback) => {
    assertSocketRole(socket.auth.role, socketRiderRoles);
    const data = await JobService.deliveredJob('socket', socket.auth._id, payload!);
    const jobId = resolveJobId(data);

    await emitJobToAudience(jobId, SOCKET_EMIT.jobDelivered, data);
    await emitJobToAudience(jobId, SOCKET_EMIT.jobUpdated, data);
    if ((data as any)?.paymentMethod === JOB_PAYMENT_METHOD.cod) {
      await emitJobToAudience(jobId, SOCKET_EMIT.depositPending, data);
    }

    sendJobAck(callback, { success: true, status: 200, message: 'Job delivered', data });
  }
);



