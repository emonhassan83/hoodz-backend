import { JobService } from '@/app/modules/job/job.services';
import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import eventHandler from '@/app/socket/utils/eventHandler';
import {
  assertSocketRole,
  emitJobToAudience,
  resolveJobId,
  sendJobAck,
  socketRiderRoles,
  socketVendorAdminRoles,
} from '@/app/socket/utils/jobSocket.helpers';

type TResendOtpPayload = {
  jobId: string;
};

export const resendOtpHandler = eventHandler<TResendOtpPayload>(
  async (socket: TSocket, payload, callback) => {
    assertSocketRole(socket.auth.role, [
      ...socketRiderRoles,
      ...socketVendorAdminRoles,
    ]);
    const data = await JobService.sendDeliveryOtp(
      'socket',
      { userId: socket.auth._id, role: socket.auth.role! },
      payload!
    );
    const jobId = resolveJobId(data.job);

    await emitJobToAudience(jobId, SOCKET_EMIT.jobOtpSent, data.job);
    sendJobAck(callback, {
      success: true,
      status: 200,
      message: 'Delivery OTP resent',
      data,
    });
  }
);


