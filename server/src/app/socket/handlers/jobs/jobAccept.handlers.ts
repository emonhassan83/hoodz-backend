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

type TJobAcceptPayload = {
  jobId: string;
};

export const jobAcceptHandler = eventHandler<TJobAcceptPayload>(
  async (socket: TSocket, payload, callback) => {
    assertSocketRole(socket.auth.role, socketRiderRoles);
    const data = await JobService.acceptJob('socket', socket.auth._id, payload!);
    const jobId = resolveJobId(data);

    await emitJobToAudience(jobId, SOCKET_EMIT.jobAccepted, data);
    await emitJobToAudience(jobId, SOCKET_EMIT.jobUpdated, data);
    sendJobAck(callback, { success: true, status: 200, message: 'Job accepted', data });
  }
);


