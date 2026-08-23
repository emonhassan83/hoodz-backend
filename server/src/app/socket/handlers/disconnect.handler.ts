import { TSocket } from '@/app/socket/interface/socket.interface';
import eventHandler from '@/app/socket/utils/eventHandler';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import onlineUsers from '@/app/socket/utils/onlineUsers';
import { getIO } from '@/app/socket/socket.init';
import { RiderAvailabilitySocketHelper } from '@/app/socket/utils/riderAvailability.helpers';

const disconnectHandler = eventHandler<any>(
  async (socket: TSocket, payload?: any, _ack?: any) => {
    try {
      const userId = socket.auth?._id?.toString();

      if (userId) {
        delete onlineUsers[userId];

        if (socket.auth.role === USER_ROLE.rider) {
          await RiderAvailabilitySocketHelper.deactivateOnDisconnect(userId);
        }

        const io = getIO();
        io.emit('onlineUser', Object.keys(onlineUsers).length);

        console.log(`👤 User disconnected: ${userId}`);
      }
    } catch (err: any) {
      console.error('❌ Disconnect handler error:', err.message);
    }
  }
);

export default disconnectHandler;

