import { JobService } from '@/app/modules/job/job.services';
import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import { getIO } from '@/app/socket/socket.init';
import eventHandler from '@/app/socket/utils/eventHandler';
import {
  assertSocketRole,
  sendJobAck,
  socketRiderRoles,
} from '@/app/socket/utils/jobSocket.helpers';

type TRiderGoOnlinePayload = {
  latitude: number;
  longitude: number;
  heading?: number;
};

export const riderGoOnlineHandler = eventHandler<TRiderGoOnlinePayload>(
  async (socket: TSocket, payload, callback) => {
    assertSocketRole(socket.auth.role, socketRiderRoles);
    const data = await JobService.riderGoOnline('socket', socket.auth._id, payload!);

    socket.emit(SOCKET_EMIT.riderOnline, data);
    getIO().emit(SOCKET_EMIT.riderAvailabilityUpdated, data);
    sendJobAck(callback, { success: true, status: 200, message: 'Rider online', data });
  }
);

