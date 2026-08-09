import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { Messages } from '@/app/modules/messages/messages.model';
import {
  assertSocketChatAccess,
  getSocketMessageById,
  sendAck,
} from '@/app/socket/handlers/chat/chatSocket.helpers';
import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import { getIO } from '@/app/socket/socket.init';
import eventHandler from '@/app/socket/utils/eventHandler';

type TEditMessagePayload = {
  messageId: string;
  text?: string;
  files?: string[];
};

export const editMessageHandler = eventHandler<TEditMessagePayload>(
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
      throw new ApiError(HttpStatusCode.Forbidden, 'You can only edit your own message');
    }

    const { participantIds } = await assertSocketChatAccess(
      message.chat.toString(),
      userId
    );

    if (payload.text !== undefined) message.text = payload.text.trim();
    if (payload.files !== undefined) message.files = payload.files;
    message.isEdited = true;
    await message.save();

    const updatedMessage = await getSocketMessageById(message._id);
    const io = getIO();

    participantIds.forEach((participantId) => {
      io.to(participantId).emit(SOCKET_EMIT.chatMessageUpdated, updatedMessage);
      io.to(participantId).emit('message-updated', updatedMessage);
    });

    sendAck(callback, {
      success: true,
      status: 200,
      message: 'Message edited successfully',
      data: updatedMessage,
    });
  }
);



