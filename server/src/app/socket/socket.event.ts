// src/app/socket/socket.event.ts
import { Socket } from 'socket.io';

import disconnectHandler from '@/app/socket/handlers/disconnect.handler';
import { TSocket } from '@/app/socket/interface/socket.interface';

export const registerSocketEvents = (socket: Socket) => {
  const tSocket = socket as TSocket; // Cast to TSocket

  tSocket.on('disconnect', () => disconnectHandler.call(tSocket, undefined));
};

export default registerSocketEvents;