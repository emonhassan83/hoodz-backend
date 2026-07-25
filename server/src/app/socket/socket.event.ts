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
import { findOnlineRiderHandler } from '@/app/socket/handlers/jobs/findOnlineRider.handlers';
import { jobAcceptHandler } from '@/app/socket/handlers/jobs/jobAccept.handlers';
import { jobAssignHandler } from '@/app/socket/handlers/jobs/jobAssign.handlers';
import { jobDeliveredHandler } from '@/app/socket/handlers/jobs/jobDelivered.handlers';
import { jobGoPickupHandler } from '@/app/socket/handlers/jobs/jobGoPickup.handlers';
import { jobOnTheWayHandler } from '@/app/socket/handlers/jobs/jobOnTheWay.handlers';
import { jobPickupHandler } from '@/app/socket/handlers/jobs/jobPickUp.handlers';
import { jobRejectHandler } from '@/app/socket/handlers/jobs/jobReject.handlers';
import { resendOtpHandler } from '@/app/socket/handlers/jobs/resendOtp.handlers';
import { riderGoOfflineHandler } from '@/app/socket/handlers/jobs/riderGoOffline.handlers';
import { riderGoOnlineHandler } from '@/app/socket/handlers/jobs/riderGoOnline.handlers';
import { riderLocationUpdateHandler } from '@/app/socket/handlers/jobs/riderLocationUpdate.handlers';
import { sendDeliveryOtpHandler } from '@/app/socket/handlers/jobs/sendDeliveryOtp.handlers';
import { submitDepositHandler } from '@/app/socket/handlers/jobs/submitDeposit.handlers';
import { verifyDepositHandler } from '@/app/socket/handlers/jobs/verifyDeposit.handlers';
import { verifyDeliveryOtpHandler } from '@/app/socket/handlers/jobs/verifyDeliveryOtp.handlers';
import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_LISTENER } from '@/app/socket/socket.constant';

export const registerSocketEvents = (socket: Socket) => {
  const tSocket = socket as TSocket; // Cast to TSocket

  // Chat related socket events
  tSocket.on(SOCKET_LISTENER.chatSendMessage, sendMessageHandler);
  tSocket.on(SOCKET_LISTENER.aiSendMessage, aiSendMessageHandler);
  tSocket.on(SOCKET_LISTENER.chatMyList, myChatListHandler);
  tSocket.on(SOCKET_LISTENER.chatTyping, typingHandler);
  tSocket.on(SOCKET_LISTENER.chatStopTyping, stopTypingHandler);
  tSocket.on(SOCKET_LISTENER.chatSeen, seenHandler);
  tSocket.on(SOCKET_LISTENER.chatEditMessage, editMessageHandler);
  tSocket.on(SOCKET_LISTENER.chatDeleteMessage, deleteMessageHandler);

  // Job related socket events
  tSocket.on(SOCKET_LISTENER.riderGoOnline, riderGoOnlineHandler);
  tSocket.on(SOCKET_LISTENER.riderGoOffline, riderGoOfflineHandler);
  tSocket.on(SOCKET_LISTENER.riderLocationUpdate, riderLocationUpdateHandler);
  tSocket.on(SOCKET_LISTENER.riderFindOnline, findOnlineRiderHandler);
  tSocket.on(SOCKET_LISTENER.jobAssign, jobAssignHandler);
  tSocket.on(SOCKET_LISTENER.jobAccept, jobAcceptHandler);
  tSocket.on(SOCKET_LISTENER.jobReject, jobRejectHandler);
  tSocket.on(SOCKET_LISTENER.jobGoPickup, jobGoPickupHandler);
  tSocket.on(SOCKET_LISTENER.jobPickup, jobPickupHandler);
  tSocket.on(SOCKET_LISTENER.jobOnTheWay, jobOnTheWayHandler);
  tSocket.on(SOCKET_LISTENER.jobSendDeliveryOtp, sendDeliveryOtpHandler);
  tSocket.on(SOCKET_LISTENER.jobResendDeliveryOtp, resendOtpHandler);
  tSocket.on(SOCKET_LISTENER.jobVerifyDeliveryOtp, verifyDeliveryOtpHandler);
  tSocket.on(SOCKET_LISTENER.jobDelivered, jobDeliveredHandler);
  tSocket.on(SOCKET_LISTENER.depositSubmitCompany, submitDepositHandler);
  tSocket.on(SOCKET_LISTENER.depositVerifyCompany, verifyDepositHandler);

  tSocket.on('disconnect', () => disconnectHandler.call(tSocket, undefined));
};

export default registerSocketEvents;

