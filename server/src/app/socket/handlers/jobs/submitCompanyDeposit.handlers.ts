import { CompanyDepositService } from '@/app/modules/companyDeposit/companyDeposit.services';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import { TSocket } from '@/app/socket/interface/socket.interface';
import eventHandler from '@/app/socket/utils/eventHandler';
import {
  assertSocketRole,
  emitToAdmins,
  sendJobAck,
  socketRiderRoles,
} from '@/app/socket/utils/jobSocket.helpers';

type TSubmitCompanyDepositPayload = {
  jobId: string;
  reference: string;
  files?: string[];
};

export const submitCompanyDepositHandler =
  eventHandler<TSubmitCompanyDepositPayload>(
  async (socket: TSocket, payload, callback) => {
    assertSocketRole(socket.auth.role, socketRiderRoles);
    const data = await CompanyDepositService.submitCompanyDeposit(
      'socket',
      socket.auth._id,
      payload!
    );

    emitToAdmins(SOCKET_EMIT.depositSubmitted, data);
    sendJobAck(callback, {
      success: true,
      status: 201,
      message: 'Company deposit submitted',
      data,
    });
  }
);

