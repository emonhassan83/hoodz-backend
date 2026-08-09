import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { Messages } from '@/app/modules/messages/messages.model';
import {
  assertSocketChatAccess,
  sendAck,
} from '@/app/socket/handlers/chat/chatSocket.helpers';
import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import { getIO } from '@/app/socket/socket.init';
import eventHandler from '@/app/socket/utils/eventHandler';

type TDeleteMessagePayload = {
  messageId: string;
};

export const deleteMessageHandler = eventHandler<TDeleteMessagePayload>(
  async (socket: TSocket, payload, callback) => {
    const userId = socket.auth._id.toString();
    const messageId = payload?.messageId;

    if (!messageId) {
      throw new ApiError(HttpStatusCode.BadRequest, 'messageId is required');
    }

    const message = await Messages.findById(messageId);
    if (!message) {
      throw new ApiError(HttpStatusCode.NotFound, 'Message not found');
    }
    if (!message.sender || message.sender.toString() !== userId) {
      throw new ApiError(HttpStatusCode.Forbidden, 'You can only delete your own message');
    }

    const chatId = message.chat.toString();
    const { participantIds } = await assertSocketChatAccess(chatId, userId);
    await Messages.findByIdAndDelete(messageId);

    const data = {
      messageId,
      chatId,
      deletedBy: userId,
      deletedAt: new Date().toISOString(),
    };
    const io = getIO();

    participantIds.forEach((participantId) => {
      io.to(participantId).emit(SOCKET_EMIT.chatMessageDeleted, data);
      io.to(participantId).emit('message-deleted', {
        success: true,
        data,
      });
    });

    sendAck(callback, {
      success: true,
      status: 200,
      message: 'Message deleted successfully',
      data,
    });
  }
);



