import { TRiderLocationUpdateSocketPayload } from '@/app/socket/interface/jobSocket.interface';
import { TSocket } from '@/app/socket/interface/socket.interface';
import eventHandler from '@/app/socket/utils/eventHandler';
import { JobSocketActions } from '@/app/socket/utils/jobSocket.actions';
import {
  assertSocketRole,
  emitOrderTrackLocation,
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

      const location = {
        lat: data.lat,
        lng: data.lng,
        speed: data.speed,
        heading: data.heading,
        encodedRoute: data.encodedRoute,
      };

      if (data.orderId) {
        emitOrderTrackLocation(data.orderId, location);
      }

      sendJobAck(callback, {
        success: true,
        status: 200,
        message: 'Rider location updated',
        data: location,
      });
    }
  );
