import { JobService } from '@/app/modules/job/job.services';
import { TSocket } from '@/app/socket/interface/socket.interface';
import eventHandler from '@/app/socket/utils/eventHandler';
import {
  assertSocketRole,
  sendJobAck,
  socketVendorAdminRoles,
} from '@/app/socket/utils/jobSocket.helpers';

type TFindOnlineRiderPayload = {
  orderId: string;
  latitude: number;
  longitude: number;
  radiusKm?: number;
};

export const findOnlineRiderHandler = eventHandler<TFindOnlineRiderPayload>(
  async (socket: TSocket, payload, callback) => {
    assertSocketRole(socket.auth.role, socketVendorAdminRoles);
    const data = await JobService.findOnlineRider(
      'socket',
      { userId: socket.auth._id, role: socket.auth.role! },
      payload!
    );

    sendJobAck(callback, {
      success: true,
      status: 200,
      message: 'Online riders fetched',
      data,
    });
  }
);



