import { ChatService } from '@/app/modules/chat/chat.services';
import { sendAck } from '@/app/socket/handlers/chat/chatSocket.helpers';
import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import eventHandler from '@/app/socket/utils/eventHandler';

export const myChatListHandler = eventHandler(
  async (socket: TSocket, _payload, callback) => {
    const data = await ChatService.getMyChatList({
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


