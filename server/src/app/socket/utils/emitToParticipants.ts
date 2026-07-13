// src/utils/emitToParticipants.ts
import { Socket } from 'socket.io';

import onlineUsers from '@/app/socket/utils/onlineUsers';

export const emitToParticipants = (
  participantIds: string[],
  event: string,
  payload: unknown
) => {
  participantIds.forEach(participantId => {
    const participantSocket = onlineUsers[participantId] as Socket;
    if (participantSocket) {
      participantSocket.emit(event, payload);
    }
  });
};