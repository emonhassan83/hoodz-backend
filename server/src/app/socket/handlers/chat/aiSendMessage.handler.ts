import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { AiAssistantService } from '@/app/modules/aiAssistant/aiAssistant.services';
import { sendAck } from '@/app/socket/handlers/chat/chatSocket.helpers';
import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import eventHandler from '@/app/socket/utils/eventHandler';

type TAiSendMessagePayload = {
  chatId?: string;
  message: string;
};

export const aiSendMessageHandler = eventHandler<TAiSendMessagePayload>(
  async (socket: TSocket, payload, callback) => {
    if (!payload?.message?.trim()) {
      throw new ApiError(HttpStatusCode.BadRequest, 'message is required');
    }

    const data = await AiAssistantService.sendMessage(
      'socket',
      {
        userId: socket.auth._id.toString(),
        role: socket.auth.role || 'user',
      },
      payload
    );

    socket.emit(SOCKET_EMIT.aiMessage, data);
    socket.emit(SOCKET_EMIT.chatNewMessage, data.userMessage);
    socket.emit(SOCKET_EMIT.chatNewMessage, data.aiMessage);
    socket.emit('new-message', data.userMessage);
    socket.emit('new-message', data.aiMessage);

    sendAck(callback, {
      success: true,
      status: 200,
      message: 'AI assistant replied successfully',
      data,
    });
  }
);

