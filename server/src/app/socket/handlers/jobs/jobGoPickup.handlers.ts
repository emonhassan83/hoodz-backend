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

type TJobGoPickupPayload = {
  jobId: string;
};

export const jobGoPickupHandler = eventHandler<TJobGoPickupPayload>(
  async (socket: TSocket, payload, callback) => {
    assertSocketRole(socket.auth.role, socketRiderRoles);
    const data = await JobService.goPickup('socket', socket.auth._id, payload!);
    await emitJobToAudience(resolveJobId(data), SOCKET_EMIT.jobUpdated, data);
    sendJobAck(callback, { success: true, status: 200, message: 'Rider going to pickup', data });
  }
);



