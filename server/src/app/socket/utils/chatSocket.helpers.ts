import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { Chat } from '@/app/modules/chat/chat.model';
import { Messages } from '@/app/modules/messages/messages.model';
import {
  attachParticipantsToChats,
  getMyParticipantChatIds,
} from '@/app/modules/participant/participant.helpers';
import { Participant } from '@/app/modules/participant/participant.model';
import { User } from '@/app/modules/user/user.model';
import { TSocketRequester } from '@/app/socket/interface/chatSocket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import { getIO } from '@/app/socket/socket.init';
import ackHandler from '@/app/socket/utils/ackHandler';

const chatPopulate = [
  { path: 'order', select: 'id status paymentStatus totalAmount deliveryType' },
];

/** Returns active participant user ids for a chat. */
export const getChatParticipantIds = async (chatId: string) => {
  const participants = await Participant.find({ chat: chatId, status: 'active' })
    .select('user -_id')
    .lean();

  return participants.map((participant) => participant.user.toString());
};

/** Throws when chat is missing or requester is not an active participant. */
export const assertSocketChatAccess = async (
  chatId: string,
  userId: string
) => {
  const [chat, participants] = await Promise.all([
    Chat.findById(chatId).select('_id type').lean(),
    getChatParticipantIds(chatId),
  ]);

  if (!chat) {
    throw new ApiError(HttpStatusCode.NotFound, 'Chat not found');
  }
  if (!participants.includes(userId)) {
    throw new ApiError(HttpStatusCode.Forbidden, 'You cannot access this chat');
  }

  return { chat, participantIds: participants };
};

/** Loads a socket-ready message payload. */
export const getSocketMessageById = async (messageId: unknown) => {
  return Messages.findById(messageId)
    .populate([{ path: 'sender', select: 'name email profileAvatar role' }])
    .select('text files seen isEdited sender senderType metadata chat createdAt updatedAt')
    .lean();
};

/** Returns chats where socket requester participates. */
export const getSocketMyChatList = async (requester: TSocketRequester) => {
  const chatIds = await getMyParticipantChatIds(requester.userId);
  const chats = await Chat.find({ _id: { $in: chatIds } })
    .populate(chatPopulate)
    .sort({ updatedAt: -1 })
    .select('-__v')
    .lean();

  return attachParticipantsToChats(chats);
};

/** Emits the latest chat list to every participant room. */
export const emitChatListsToParticipants = async (
  participantIds: string[],
  role = 'user'
) => {
  const io = getIO();

  await Promise.all(
    participantIds.map(async (participantId) => {
      const data = await getSocketMyChatList({ userId: participantId, role });
      io.to(participantId).emit(SOCKET_EMIT.chatList, data);
      io.to(participantId).emit('chat-list', data);
    })
  );
};

/** Emits unread message counts to participant rooms. */
export const emitUnreadCountsToParticipants = async (
  chatId: string,
  participantIds: string[]
) => {
  const io = getIO();

  await Promise.all(
    participantIds.map(async (participantId) => {
      const unreadCount = await Messages.countDocuments({
        chat: chatId,
        seen: false,
        senderType: { $ne: 'ai' },
        sender: { $ne: participantId },
      });
      io.to(participantId).emit(SOCKET_EMIT.unreadCount, {
        chatId,
        unreadCount,
      });
      io.to(participantId).emit('new-notifications', unreadCount);
    })
  );
};

/** Sends a socket ack response when callback is provided. */
export const sendAck = (
  callback: unknown,
  data: { success: boolean; message?: string; data?: unknown; status?: number }
) => {
  ackHandler(callback as any, data);
};

/** Gets display info for typing events. */
export const getTypingUser = async (userId: string) => {
  const user = await User.findById(userId).select('name profileAvatar').lean();
  return {
    userId,
    name: user?.name || 'Unknown',
    profileAvatar: user?.profileAvatar || null,
  };
};
