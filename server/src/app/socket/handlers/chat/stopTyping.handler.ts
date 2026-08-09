import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import {
  assertSocketChatAccess,
  getTypingUser,
  sendAck,
} from '@/app/socket/handlers/chat/chatSocket.helpers';
import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import { getIO } from '@/app/socket/socket.init';
import eventHandler from '@/app/socket/utils/eventHandler';

type TStopTypingPayload = {
  chatId: string;
};

export const stopTypingHandler = eventHandler<TStopTypingPayload>(
  async (socket: TSocket, payload, callback) => {
    const userId = socket.auth._id.toString();
    const chatId = payload?.chatId;

    if (!chatId) {
      throw new ApiError(HttpStatusCode.BadRequest, 'chatId is required');
    }

    const { participantIds } = await assertSocketChatAccess(chatId, userId);
    const typingUser = await getTypingUser(userId);
    const data = {
      chatId,
      ...typingUser,
      isTyping: false,
      timestamp: new Date().toISOString(),
    };
    const io = getIO();

    participantIds
      .filter((participantId) => participantId !== userId)
      .forEach((participantId) => {
        io.to(participantId).emit(SOCKET_EMIT.chatStopTyping, data);
        io.to(participantId).emit('stopTyping', { success: true, data });
      });

    sendAck(callback, {
      success: true,
      status: 200,
      message: 'Stop typing status sent successfully',
      data,
    });
  }
);



