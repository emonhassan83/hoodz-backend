import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import { getIO } from '@/app/socket/socket.init';
import eventHandler from '@/app/socket/utils/eventHandler';
import { JobSocketActions } from '@/app/socket/utils/jobSocket.actions';
import {
  assertSocketRole,
  sendJobAck,
  socketRiderRoles,
} from '@/app/socket/utils/jobSocket.helpers';

export const riderGoOfflineHandler = eventHandler(
  async (socket: TSocket, _payload, callback) => {
    assertSocketRole(socket.auth.role, socketRiderRoles);
    const data = await JobSocketActions.riderGoOffline(socket.auth._id);

    socket.emit(SOCKET_EMIT.riderOffline, data);
    getIO().emit(SOCKET_EMIT.riderAvailabilityUpdated, data);
    sendJobAck(callback, {
      success: true,
      status: 200,
      message: 'Rider offline',
      data,
    });
  }
);
