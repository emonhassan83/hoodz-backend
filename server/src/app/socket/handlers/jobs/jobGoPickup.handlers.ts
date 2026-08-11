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

export const jobGoPickupHandler = eventHandler<TJobIdSocketPayload>(
  async (socket: TSocket, payload, callback) => {
    assertSocketRole(socket.auth.role, socketRiderRoles);
    const data = await JobSocketActions.goPickup(
      'socket',
      socket.auth._id,
      payload!
    );
    await emitJobToAudience(resolveJobId(data), SOCKET_EMIT.jobUpdated, data);
    sendJobAck(callback, {
      success: true,
      status: 200,
      message: 'Rider going to pickup',
      data,
    });
  }
);
