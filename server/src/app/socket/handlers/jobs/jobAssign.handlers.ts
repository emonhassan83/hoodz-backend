import { JobService } from '@/app/modules/job/job.services';
import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import { getIO } from '@/app/socket/socket.init';
import eventHandler from '@/app/socket/utils/eventHandler';
import {
  assertSocketRole,
  emitJobToAudience,
  resolveJobId,
  sendJobAck,
  socketVendorAdminRoles,
} from '@/app/socket/utils/jobSocket.helpers';

type TJobAssignPayload = {
  orderId: string;
  riderId: string;
  assignmentType?: 'vendor' | 'admin' | 'auto';
  paymentMethod?: 'card' | 'wallet' | 'cod';
};

export const jobAssignHandler = eventHandler<TJobAssignPayload>(
  async (socket: TSocket, payload, callback) => {
    assertSocketRole(socket.auth.role, socketVendorAdminRoles);
    const data = await JobService.assignJob(
      'socket',
      { userId: socket.auth._id, role: socket.auth.role! },
      payload!
    );
    const jobId = resolveJobId(data);

    getIO().to(payload!.riderId).emit(SOCKET_EMIT.jobAssigned, data);
    await emitJobToAudience(jobId, SOCKET_EMIT.jobUpdated, data);
    sendJobAck(callback, { success: true, status: 201, message: 'Job assigned', data });
  }
);

