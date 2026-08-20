import { TJobRejectSocketPayload } from '@/app/socket/interface/jobSocket.interface';
import { TSocket } from '@/app/socket/interface/socket.interface';
import eventHandler from '@/app/socket/utils/eventHandler';
import { JobSocketActions } from '@/app/socket/utils/jobSocket.actions';
import {
  assertSocketRole,
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

    sendJobAck(callback, {
      success: true,
      status: 200,
      message: 'Job offer declined',
      data,
    });
  }
);
