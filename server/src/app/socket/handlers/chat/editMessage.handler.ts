import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { MessagesService } from '@/app/modules/messages/messages.services';
import { TEditMessagePayload } from '@/app/socket/interface/chatSocket.interface';
import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import {
  assertSocketChatAccess,
  emitToChatParticipants,
  sendAck,
} from '@/app/socket/utils/chatSocket.helpers';
import eventHandler from '@/app/socket/utils/eventHandler';

export const editMessageHandler = eventHandler<TEditMessagePayload>(
  async (socket: TSocket, payload, callback) => {
    const userId = socket.auth._id.toString();
    const messageId = payload?.messageId;

    if (!messageId) {
      throw new ApiError(HttpStatusCode.BadRequest, 'messageId is required');
    }

    const updatedMessage = await MessagesService.editMessage(
      'socket',
      { userId, role: socket.auth.role || 'user' },
      {
        messageId,
        text: payload.text,
        files: payload.files,
      }
    );
    const { participantIds } = await assertSocketChatAccess(
      String((updatedMessage as any)?.chat?._id ?? (updatedMessage as any)?.chat),
      userId,
      socket.auth.role
    );

    emitToChatParticipants(
      participantIds,
      SOCKET_EMIT.chatMessageUpdated,
      updatedMessage
    );

    sendAck(callback, {
      success: true,
      status: 200,
      message: 'Message edited successfully',
      data: updatedMessage,
    });
  }
);
