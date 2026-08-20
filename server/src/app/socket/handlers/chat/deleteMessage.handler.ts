import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { MessagesService } from '@/app/modules/messages/messages.services';
import { TDeleteMessagePayload } from '@/app/socket/interface/chatSocket.interface';
import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import {
  assertSocketChatAccess,
  emitToChatParticipants,
  sendAck,
} from '@/app/socket/utils/chatSocket.helpers';
import eventHandler from '@/app/socket/utils/eventHandler';

export const deleteMessageHandler = eventHandler<TDeleteMessagePayload>(
  async (socket: TSocket, payload, callback) => {
    const userId = socket.auth._id.toString();
    const messageId = payload?.messageId;

    if (!messageId) {
      throw new ApiError(HttpStatusCode.BadRequest, 'messageId is required');
    }

    const data = await MessagesService.deleteMessage(
      'socket',
      { userId, role: socket.auth.role || 'user' },
      messageId
    );
    const { participantIds } = await assertSocketChatAccess(
      data.chatId,
      userId,
      socket.auth.role
    );

    emitToChatParticipants(participantIds, SOCKET_EMIT.chatMessageDeleted, data);

    sendAck(callback, {
      success: true,
      status: 200,
      message: 'Message deleted successfully',
      data,
    });
  }
);
