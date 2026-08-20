import { TJobAssignSocketPayload } from '@/app/socket/interface/jobSocket.interface';
import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import { getIO } from '@/app/socket/socket.init';
import eventHandler from '@/app/socket/utils/eventHandler';
import { JobSocketActions } from '@/app/socket/utils/jobSocket.actions';
import {
  assertSocketRole,
  sendJobAck,
  socketAssignRoles,
} from '@/app/socket/utils/jobSocket.helpers';

export const jobAssignHandler = eventHandler<TJobAssignSocketPayload>(
  async (socket: TSocket, payload, callback) => {
    assertSocketRole(socket.auth.role, socketAssignRoles);
    const data = await JobSocketActions.assignJob(
      'socket',
      { userId: socket.auth._id, role: socket.auth.role! },
      payload!
    );
    getIO().to(payload!.riderId).emit(SOCKET_EMIT.jobAssigned, data);
    sendJobAck(callback, {
      success: true,
      status: 201,
      message: 'Job assigned',
      data,
    });
  }
);
