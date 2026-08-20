import { TJobIdSocketPayload } from '@/app/socket/interface/jobSocket.interface';
import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import eventHandler from '@/app/socket/utils/eventHandler';
import { JobSocketActions } from '@/app/socket/utils/jobSocket.actions';
import {
  assertSocketRole,
  notifyJobOrderStatus,
  sendJobAck,
  socketRiderRoles,
} from '@/app/socket/utils/jobSocket.helpers';

export const jobOnTheWayHandler = eventHandler<TJobIdSocketPayload>(
  async (socket: TSocket, payload, callback) => {
    assertSocketRole(socket.auth.role, socketRiderRoles);
    const data = await JobSocketActions.onTheWay(
      'socket',
      socket.auth._id,
      payload!
    );

    await notifyJobOrderStatus(data, SOCKET_EMIT.jobOnTheWay);
    sendJobAck(callback, {
      success: true,
      status: 200,
      message: 'Job on the way',
      data,
    });
  }
);
