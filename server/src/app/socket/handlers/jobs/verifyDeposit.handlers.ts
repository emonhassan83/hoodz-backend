import { DEPOSIT_STATUS } from '@/app/modules/deposit/deposit.constant';
import { DepositService } from '@/app/modules/deposit/deposit.services';
import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import { getIO } from '@/app/socket/socket.init';
import eventHandler from '@/app/socket/utils/eventHandler';
import {
  assertSocketRole,
  emitToAdmins,
  sendJobAck,
  socketAdminRoles,
} from '@/app/socket/utils/jobSocket.helpers';

type TVerifyDepositPayload = {
  depositId: string;
  status: 'verified' | 'rejected';
  reason?: string;
};

export const verifyDepositHandler =
  eventHandler<TVerifyDepositPayload>(
  async (socket: TSocket, payload, callback) => {
    assertSocketRole(socket.auth.role, socketAdminRoles);
    const data = await DepositService.verifyDeposit(
      'socket',
      { userId: socket.auth._id, role: socket.auth.role! },
      payload!.depositId,
      { status: payload!.status, reason: payload!.reason }
    );
    const riderId = String((data as any)?.rider?._id ?? (data as any)?.rider);
    const event =
      payload!.status === DEPOSIT_STATUS.verified
        ? SOCKET_EMIT.depositVerified
        : SOCKET_EMIT.depositRejected;

    getIO().to(riderId).emit(event, data);
    emitToAdmins(event, data);
    sendJobAck(callback, {
      success: true,
      status: 200,
      message: 'Deposit status updated',
      data,
    });
  }
);



