import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { TAiSendMessagePayload } from '@/app/socket/interface/chatSocket.interface';
import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import { sendAiSocketMessage } from '@/app/socket/utils/aiAssistantSocket.actions';
import { sendAck } from '@/app/socket/utils/chatSocket.helpers';
import eventHandler from '@/app/socket/utils/eventHandler';

export const aiSendMessageHandler = eventHandler<TAiSendMessagePayload>(
  async (socket: TSocket, payload, callback) => {
    if (!payload?.message?.trim()) {
      throw new ApiError(HttpStatusCode.BadRequest, 'message is required');
    }

    const data = await sendAiSocketMessage(
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

    sendAck(callback, {
      success: true,
      status: 200,
      message: 'AI assistant replied successfully',
      data,
    });
  }
);


