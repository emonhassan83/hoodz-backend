import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { Messages } from '@/app/modules/messages/messages.model';
import {
  assertSocketChatAccess,
  emitChatListsToParticipants,
  emitUnreadCountsToParticipants,
  getSocketMessageById,
  sendAck,
} from '@/app/socket/handlers/chat/chatSocket.helpers';
import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import { getIO } from '@/app/socket/socket.init';
import eventHandler from '@/app/socket/utils/eventHandler';

type TSendMessagePayload = {
  chatId: string;
  text?: string;
  files?: string[];
};

export const sendMessageHandler = eventHandler<TSendMessagePayload>(
  async (socket: TSocket, payload, callback) => {
    const userId = socket.auth._id.toString();
    const chatId = payload?.chatId;
    const text = payload?.text?.trim();
    const files = payload?.files ?? [];

    if (!chatId) {
      throw new ApiError(HttpStatusCode.BadRequest, 'chatId is required');
    }
    if (!text && files.length === 0) {
      throw new ApiError(HttpStatusCode.BadRequest, 'text or files is required');
    }

    const { participantIds } = await assertSocketChatAccess(chatId, userId);
    const message = await Messages.create({
      chat: chatId,
      sender: userId,
      senderType: 'user',
      text,
      files,
    });
    const populated = await getSocketMessageById(message._id);
    const io = getIO();

    participantIds.forEach((participantId) => {
      io.to(participantId).emit(SOCKET_EMIT.chatNewMessage, populated);
      io.to(participantId).emit('new-message', populated);
    });

    await Promise.all([
      emitChatListsToParticipants(participantIds, socket.auth.role),
      emitUnreadCountsToParticipants(chatId, participantIds),
    ]);

    sendAck(callback, {
      success: true,
      status: 200,
      message: 'Message sent successfully',
      data: populated,
    });
  }
);



