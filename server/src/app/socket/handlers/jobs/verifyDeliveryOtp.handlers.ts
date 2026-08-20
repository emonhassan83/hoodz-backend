import { TVerifyDeliveryOtpSocketPayload } from '@/app/socket/interface/jobSocket.interface';
import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import eventHandler from '@/app/socket/utils/eventHandler';
import { JobSocketActions } from '@/app/socket/utils/jobSocket.actions';
import {
  assertSocketRole,
  emitToUserIds,
  getJobCustomerId,
  sendJobAck,
  socketRiderRoles,
} from '@/app/socket/utils/jobSocket.helpers';

export const verifyDeliveryOtpHandler =
  eventHandler<TVerifyDeliveryOtpSocketPayload>(
    async (socket: TSocket, payload, callback) => {
      assertSocketRole(socket.auth.role, socketRiderRoles);
      const data = await JobSocketActions.verifyDeliveryOtp(
        'socket',
        socket.auth._id,
        payload!
      );
      const customerId = getJobCustomerId(data);
      if (customerId) {
        emitToUserIds([customerId], SOCKET_EMIT.jobOtpVerified, data);
      }
      sendJobAck(callback, {
        success: true,
        status: 200,
        message: 'Delivery OTP verified',
        data,
      });
    }
  );
