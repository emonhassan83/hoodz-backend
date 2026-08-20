import { TJobRejectSocketPayload } from '@/app/socket/interface/jobSocket.interface';
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

export const jobRejectHandler = eventHandler<TJobRejectSocketPayload>(
  async (socket: TSocket, payload, callback) => {
    assertSocketRole(socket.auth.role, socketRiderRoles);
    const data = await JobSocketActions.rejectJob(
      'socket',
      socket.auth._id,
      payload!
    );
    const jobId = resolveJobId(data);

    socket.emit(SOCKET_EMIT.jobRejected, data);
    socket.emit(SOCKET_EMIT.jobUpdated, data);
    await emitJobToAudience(jobId, SOCKET_EMIT.jobUpdated, data);
    sendJobAck(callback, {
      success: true,
      status: 200,
      message: 'Job offer declined',
      data,
    });
  }
);
