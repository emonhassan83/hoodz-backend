import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { ChatService } from '@/app/modules/chat/chat.services';
import { Messages } from '@/app/modules/messages/messages.model';
import { getPopulatedMessageById } from '@/app/modules/messages/messages.helpers';
import { PARTICIPANT_STATUS } from '@/app/modules/participant/participant.constant';
import { Participant } from '@/app/modules/participant/participant.model';
import {
  getAssignedAgentId,
  getCustomerIdForChat,
} from '@/app/modules/supportAssignment/supportAssignment.helpers';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import { User } from '@/app/modules/user/user.model';
import { TSocketRequester } from '@/app/socket/interface/chatSocket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import { getIO } from '@/app/socket/socket.init';
import ackHandler from '@/app/socket/utils/ackHandler';
import { Chat } from '@/app/modules/chat/chat.model';

/** Returns active participant user ids for a chat. */
export const getChatParticipantIds = async (chatId: string) => {
  const participants = await Participant.find({
    chat: chatId,
    status: PARTICIPANT_STATUS.active,
  })
    .select('user -_id')
    .lean();

  return participants.map((participant) => participant.user.toString());
};

/** Throws when chat is missing or requester is not an active participant or admin. */
export const assertSocketChatAccess = async (
  chatId: string,
  userId: string,
  role?: string
) => {
  const [chat, participants] = await Promise.all([
    Chat.findById(chatId).select('_id type').lean(),
    getChatParticipantIds(chatId),
  ]);

  if (!chat) {
    throw new ApiError(HttpStatusCode.NotFound, 'Chat not found');
  }

  const isAdmin = role === USER_ROLE.admin;
  if (isAdmin) {
    return {
      chat,
      participantIds: [...new Set([...participants, userId])],
    };
  }

  if (role === USER_ROLE.agent) {
    const customerId = await getCustomerIdForChat(chatId);
    const assigned = customerId ? await getAssignedAgentId(customerId) : null;
    if (!customerId || assigned !== userId) {
      throw new ApiError(HttpStatusCode.Forbidden, 'You cannot access this chat');
    }
    return {
      chat,
      participantIds: [...new Set([...participants, userId])],
    };
  }

  if (!participants.includes(userId)) {
    throw new ApiError(HttpStatusCode.Forbidden, 'You cannot access this chat');
  }

  return {
    chat,
    participantIds: [...new Set([...participants, userId])],
  };
};

/** Loads a socket-ready message payload. */
export const getSocketMessageById = getPopulatedMessageById;

/** Returns chats where socket requester participates. */
export const getSocketMyChatList = async (requester: TSocketRequester) => {
  const result = await ChatService.getMyChatList(requester, {
    page: '1',
    limit: '200',
  });
  return result.data;
};

/** Emits the latest chat list to every participant room. */
export const emitChatListsToParticipants = async (participantIds: string[]) => {
  const io = getIO();
  const users = await User.find({ _id: { $in: participantIds } })
    .select('_id role')
    .lean();
  const roleById = new Map(
    users.map((user) => [user._id.toString(), user.role || 'user'])
  );

  await Promise.all(
    participantIds.map(async (participantId) => {
      const result = await ChatService.getMyChatList(
        {
          userId: participantId,
          role: roleById.get(participantId) || 'user',
        },
        { page: '1', limit: '200' }
      );
      io.to(participantId).emit(SOCKET_EMIT.chatList, result.data);
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
    })
  );
};

/** Sends a socket event to every chat audience room. */
export const emitToChatParticipants = (
  participantIds: string[],
  event: string,
  payload: unknown
) => {
  const io = getIO();
  participantIds.forEach((participantId) => io.to(participantId).emit(event, payload));
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
