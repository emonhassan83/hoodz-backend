import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { ChatService } from '@/app/modules/chat/chat.services';
import { MessagesService } from '@/app/modules/messages/messages.services';
import { TSendMessagePayload } from '@/app/socket/interface/chatSocket.interface';
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

export const sendMessageHandler = eventHandler<TSendMessagePayload>(
  async (socket: TSocket, payload, callback) => {
    const userId = socket.auth._id.toString();
    const text = payload?.text?.trim();
    const files = payload?.files ?? [];

    if (!text && files.length === 0) {
      throw new ApiError(HttpStatusCode.BadRequest, 'text or files is required');
    }

    const requester = { userId, role: socket.auth.role || 'user' };
    const chatId = await ChatService.resolveChatIdForSend('socket', requester, {
      chatId: payload?.chatId,
      type: payload?.type,
      order: payload?.order,
      participant: payload?.participant,
      participent: payload?.participent,
    });

    const { participantIds } = await assertSocketChatAccess(
      chatId,
      userId,
      socket.auth.role
    );
    const populated = await MessagesService.sendMessage(
      'socket',
      requester,
      { chatId, text, files }
    );

    emitToChatParticipants(participantIds, SOCKET_EMIT.chatNewMessage, populated);
    await Promise.all([
      emitChatListsToParticipants(participantIds),
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
