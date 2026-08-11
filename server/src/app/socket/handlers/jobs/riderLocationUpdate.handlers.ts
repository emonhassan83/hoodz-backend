import { TRiderLocationUpdateSocketPayload } from '@/app/socket/interface/jobSocket.interface';
import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import eventHandler from '@/app/socket/utils/eventHandler';
import { JobSocketActions } from '@/app/socket/utils/jobSocket.actions';
import {
  assertSocketRole,
  emitJobToAudience,
  sendJobAck,
  socketRiderRoles,
} from '@/app/socket/utils/jobSocket.helpers';

export const riderLocationUpdateHandler =
  eventHandler<TRiderLocationUpdateSocketPayload>(
    async (socket: TSocket, payload, callback) => {
      assertSocketRole(socket.auth.role, socketRiderRoles);
      const data = await JobSocketActions.riderLocationUpdate(
        'socket',
        socket.auth._id,
        payload!
      );

      await emitJobToAudience(
        payload!.jobId,
        SOCKET_EMIT.riderLocationUpdated,
        data
      );
      sendJobAck(callback, {
        success: true,
        status: 200,
        message: 'Rider location updated',
        data,
      });
    }
  );
