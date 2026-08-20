import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { MessagesService } from '@/app/modules/messages/messages.services';
import { TSeenPayload } from '@/app/socket/interface/chatSocket.interface';
import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import {
  assertSocketChatAccess,
  emitChatListsToParticipants,
  emitToChatParticipants,
  emitUnreadCountsToParticipants,
  sendAck,
} from '@/app/socket/utils/chatSocket.helpers';
import eventHandler from '@/app/socket/utils/eventHandler';

export const seenHandler = eventHandler<TSeenPayload>(
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
    const payloadData = await MessagesService.markMessagesSeen(
      'socket',
      { userId, role: socket.auth.role || 'user' },
      chatId
    );

    emitToChatParticipants(participantIds, SOCKET_EMIT.chatSeen, payloadData);
    await Promise.all([
      emitChatListsToParticipants(participantIds),
      emitUnreadCountsToParticipants(chatId, participantIds),
    ]);

    sendAck(callback, {
      success: true,
      status: 200,
      message: 'Messages marked as seen',
      data: payloadData,
    });
  }
);
