import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { TTypingPayload } from '@/app/socket/interface/chatSocket.interface';
import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import {
  assertSocketChatAccess,
  emitToChatParticipants,
  getTypingUser,
  sendAck,
} from '@/app/socket/utils/chatSocket.helpers';
import eventHandler from '@/app/socket/utils/eventHandler';

export const typingHandler = eventHandler<TTypingPayload>(
  async (socket: TSocket, payload, callback) => {
    const userId = socket.auth._id.toString();
    const chatId = payload?.chatId;

    if (!chatId) {
      throw new ApiError(HttpStatusCode.BadRequest, 'chatId is required');
    }

    const { participantIds } = await assertSocketChatAccess(
      chatId,
      userId,
      socket.auth.role
    );
    const typingUser = await getTypingUser(userId);
    const data = {
      chatId,
      ...typingUser,
      isTyping: true,
      timestamp: new Date().toISOString(),
    };

    emitToChatParticipants(
      participantIds.filter((participantId) => participantId !== userId),
      SOCKET_EMIT.chatTyping,
      data
    );

    sendAck(callback, {
      success: true,
      status: 200,
      message: 'Typing status sent successfully',
      data,
    });
  }
);
