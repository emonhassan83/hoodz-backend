import { TJobIdSocketPayload } from '@/app/socket/interface/jobSocket.interface';
import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import eventHandler from '@/app/socket/utils/eventHandler';
import { JobSocketActions } from '@/app/socket/utils/jobSocket.actions';
import {
  assertSocketRole,
  emitJobToAudience,
  resolveJobId,
  sendJobAck,
  socketRiderRoles,
  socketVendorAdminRoles,
} from '@/app/socket/utils/jobSocket.helpers';

export const sendDeliveryOtpHandler = eventHandler<TJobIdSocketPayload>(
  async (socket: TSocket, payload, callback) => {
    assertSocketRole(socket.auth.role, [
      ...socketRiderRoles,
      ...socketVendorAdminRoles,
    ]);
    const data = await JobSocketActions.sendDeliveryOtp(
      'socket',
      { userId: socket.auth._id, role: socket.auth.role! },
      payload!
    );
    const jobId = resolveJobId(data.job);

    await emitJobToAudience(jobId, SOCKET_EMIT.jobOtpSent, data.job);
    await emitJobToAudience(jobId, SOCKET_EMIT.jobUpdated, data.job);
    sendJobAck(callback, {
      success: true,
      status: 200,
      message: 'Delivery OTP sent or resent',
      data: {
        verificationToken: data.verificationToken,
        otp: data.mock ? data.otp : null,
        mock: data.mock,
      },
    });
  }
);
