import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import { getSocketMyChatList, sendAck } from '@/app/socket/utils/chatSocket.helpers';
import eventHandler from '@/app/socket/utils/eventHandler';

export const myChatListHandler = eventHandler(
  async (socket: TSocket, _payload, callback) => {
    const data = await getSocketMyChatList({
      userId: socket.auth._id.toString(),
      role: socket.auth.role || 'user',
    });

    socket.emit(SOCKET_EMIT.chatList, data);
    socket.emit('chat-list', data);

    sendAck(callback, {
      success: true,
      status: 200,
      message: 'Chat list fetched successfully',
      data,
    });
  }
);



