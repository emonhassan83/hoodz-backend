// src/app/socket/socket.event.ts
import { Socket } from 'socket.io';

import { aiSendMessageHandler } from '@/app/socket/handlers/chat/aiSendMessage.handler';
import { deleteMessageHandler } from '@/app/socket/handlers/chat/deleteMessage.handler';
import { editMessageHandler } from '@/app/socket/handlers/chat/editMessage.handler';
import { myChatListHandler } from '@/app/socket/handlers/chat/myChatList.handler';
import { seenHandler } from '@/app/socket/handlers/chat/seen.handler';
import { sendMessageHandler } from '@/app/socket/handlers/chat/sendMessage.handler';
import { stopTypingHandler } from '@/app/socket/handlers/chat/stopTyping.handler';
import { typingHandler } from '@/app/socket/handlers/chat/typing.handler';
import disconnectHandler from '@/app/socket/handlers/disconnect.handler';
import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_LISTENER } from '@/app/socket/socket.constant';

export const registerSocketEvents = (socket: Socket) => {
  const tSocket = socket as TSocket; // Cast to TSocket

  tSocket.on(SOCKET_LISTENER.chatSendMessage, sendMessageHandler);
  tSocket.on(SOCKET_LISTENER.aiSendMessage, aiSendMessageHandler);
  tSocket.on(SOCKET_LISTENER.chatMyList, myChatListHandler);
  tSocket.on(SOCKET_LISTENER.chatTyping, typingHandler);
  tSocket.on(SOCKET_LISTENER.chatStopTyping, stopTypingHandler);
  tSocket.on(SOCKET_LISTENER.chatSeen, seenHandler);
  tSocket.on(SOCKET_LISTENER.chatEditMessage, editMessageHandler);
  tSocket.on(SOCKET_LISTENER.chatDeleteMessage, deleteMessageHandler);

  tSocket.on('send-message', sendMessageHandler);
  tSocket.on('my-chat-list', myChatListHandler);
  tSocket.on('typing', typingHandler);
  tSocket.on('stopTyping', stopTypingHandler);
  tSocket.on('seen', seenHandler);
  tSocket.on('edit-message', editMessageHandler);
  tSocket.on('delete-message', deleteMessageHandler);

  tSocket.on('disconnect', () => disconnectHandler.call(tSocket, undefined));
};

export default registerSocketEvents;
