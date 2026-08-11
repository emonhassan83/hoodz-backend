import { TFindOnlineRiderSocketPayload } from '@/app/socket/interface/jobSocket.interface';
import { TSocket } from '@/app/socket/interface/socket.interface';
import eventHandler from '@/app/socket/utils/eventHandler';
import { JobSocketActions } from '@/app/socket/utils/jobSocket.actions';
import {
  assertSocketRole,
  sendJobAck,
  socketVendorAdminRoles,
} from '@/app/socket/utils/jobSocket.helpers';

export const findOnlineRiderHandler = eventHandler<TFindOnlineRiderSocketPayload>(
  async (socket: TSocket, payload, callback) => {
    assertSocketRole(socket.auth.role, socketVendorAdminRoles);
    const data = await JobSocketActions.findOnlineRider(
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



