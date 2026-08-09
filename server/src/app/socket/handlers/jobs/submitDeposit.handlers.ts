import { DepositService } from '@/app/modules/deposit/deposit.services';
import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import eventHandler from '@/app/socket/utils/eventHandler';
import {
  assertSocketRole,
  emitToAdmins,
  sendJobAck,
  socketRiderRoles,
} from '@/app/socket/utils/jobSocket.helpers';

type TSubmitDepositPayload = {
  jobId: string;
  reference: string;
  files?: string[];
};

export const submitDepositHandler =
  eventHandler<TSubmitDepositPayload>(
  async (socket: TSocket, payload, callback) => {
    assertSocketRole(socket.auth.role, socketRiderRoles);
    const data = await DepositService.submitDeposit(
      'socket',
      socket.auth._id,
      payload!
    );

    emitToAdmins(SOCKET_EMIT.depositSubmitted, data);
    sendJobAck(callback, {
      success: true,
      status: 201,
      message: 'Deposit submitted',
      data,
    });
  }
);



