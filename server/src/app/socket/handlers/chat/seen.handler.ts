import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { Messages } from '@/app/modules/messages/messages.model';
import {
  assertSocketChatAccess,
  emitChatListsToParticipants,
  emitUnreadCountsToParticipants,
  sendAck,
} from '@/app/socket/handlers/chat/chatSocket.helpers';
import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import { getIO } from '@/app/socket/socket.init';
import eventHandler from '@/app/socket/utils/eventHandler';

type TSeenPayload = {
  chatId: string;
};

export const seenHandler = eventHandler<TSeenPayload>(
  async (socket: TSocket, payload, callback) => {
    const userId = socket.auth._id.toString();
    const chatId = payload?.chatId;

    if (!chatId) {
      throw new ApiError(HttpStatusCode.BadRequest, 'chatId is required');
    }

    const { participantIds } = await assertSocketChatAccess(chatId, userId);

    await Messages.updateMany(
      {
        chat: chatId,
        seen: false,
        sender: { $ne: userId },
      },
      { $set: { seen: true } }
    );

    const payloadData = {
      chatId,
      seenBy: userId,
      seenAt: new Date().toISOString(),
    };
    const io = getIO();

    participantIds.forEach((participantId) => {
      io.to(participantId).emit(SOCKET_EMIT.chatSeen, payloadData);
    });

    await Promise.all([
      emitChatListsToParticipants(participantIds, socket.auth.role),
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



