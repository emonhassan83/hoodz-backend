import { JobService } from '@/app/modules/job/job.services';
import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import eventHandler from '@/app/socket/utils/eventHandler';
import {
  assertSocketRole,
  emitJobToAudience,
  sendJobAck,
  socketRiderRoles,
} from '@/app/socket/utils/jobSocket.helpers';

type TRiderLocationUpdatePayload = {
  jobId: string;
  latitude: number;
  longitude: number;
  heading?: number;
};

export const riderLocationUpdateHandler =
  eventHandler<TRiderLocationUpdatePayload>(
  async (socket: TSocket, payload, callback) => {
    assertSocketRole(socket.auth.role, socketRiderRoles);
    const data = await JobService.riderLocationUpdate('socket', socket.auth._id, payload!);

    await emitJobToAudience(payload!.jobId, SOCKET_EMIT.riderLocationUpdated, data);
    sendJobAck(callback, {
      success: true,
      status: 200,
      message: 'Rider location updated',
      data,
    });
  }
);


