import { HttpStatusCode } from 'axios';
import { Types } from 'mongoose';

import ApiError from '@/app/errors/ApiError';
import { Chat } from '@/app/modules/chat/chat.model';
import { Messages } from '@/app/modules/messages/messages.model';
import { getMyParticipantChatIds, isChatParticipant } from '@/app/modules/participant/participant.helpers';
import {
  assertAgentAssignedToCustomer,
  getCustomerIdForChat,
} from '@/app/modules/supportAssignment/supportAssignment.helpers';
import { USER_ROLE } from '@/app/modules/user/user.constant';

type TMessageRequester = { userId: string; role?: string };

/** Throws when the requester cannot read or write this chat. */
export const assertMessageChatAccess = async (
  traceId: string,
  chatId: string,
  user: TMessageRequester
) => {
  const chat = await Chat.findById(chatId).select('_id type');
  if (!chat) {
    throw new ApiError(HttpStatusCode.NotFound, 'Chat not found', traceId);
  }

  const isAdmin = user.role === USER_ROLE.admin;
  if (isAdmin) return chat;

  if (user.role === USER_ROLE.agent) {
    const customerId = await getCustomerIdForChat(chatId);
    if (!customerId) {
      throw new ApiError(HttpStatusCode.Forbidden, 'You cannot access this chat', traceId);
    }
    await assertAgentAssignedToCustomer(traceId, user.userId, customerId);
    return chat;
  }

  const isParticipant = await isChatParticipant(chatId, user.userId);
  if (!isParticipant) {
    throw new ApiError(HttpStatusCode.Forbidden, 'You cannot access this chat', traceId);
  }

  return chat;
};

/** Returns unread message counts per chat for a user. */
export const getUnreadMessageCountsByChatIds = async (
  userId: string,
  chatIds: string[]
) => {
  const counts = new Map<string, number>();
  if (!chatIds.length) return counts;

  const objectIds = chatIds
    .filter((chatId) => Types.ObjectId.isValid(chatId))
    .map((chatId) => new Types.ObjectId(chatId));
  if (!objectIds.length) return counts;

  const rows = await Messages.aggregate<{ _id: Types.ObjectId; count: number }>([
    {
      $match: {
        chat: { $in: objectIds },
        seen: false,
        sender: { $ne: new Types.ObjectId(userId) },
      },
    },
    {
      $group: {
        _id: '$chat',
        count: { $sum: 1 },
      },
    },
  ]);

  for (const row of rows) {
    counts.set(String(row._id), row.count);
  }

  return counts;
};

/** Returns how many chats have at least one unread message for the user. */
export const getUnreadChatCountForUser = async (
  userId: string,
  chatIds?: Array<Types.ObjectId | string>
) => {
  const ids = chatIds?.map((chatId) => String(chatId)) ?? (await getMyParticipantChatIds(userId)).map(String);
  if (!ids.length) return 0;

  const objectIds = ids
    .filter((chatId) => Types.ObjectId.isValid(chatId))
    .map((chatId) => new Types.ObjectId(chatId));
  if (!objectIds.length) return 0;

  const result = await Messages.aggregate<{ unreadChatCount: number }>([
    {
      $match: {
        chat: { $in: objectIds },
        seen: false,
        sender: { $ne: new Types.ObjectId(userId) },
      },
    },
    {
      $group: {
        _id: '$chat',
      },
    },
    {
      $count: 'unreadChatCount',
    },
  ]);

  return result[0]?.unreadChatCount ?? 0;
};

/** Bumps chat updatedAt so the inbox list stays newest-first. */
export const touchChatUpdatedAt = async (chatId: string) => {
  await Chat.findByIdAndUpdate(chatId, { updatedAt: new Date() });
};

/** Loads a populated message for API or socket payloads. */
export const getPopulatedMessageById = async (messageId: unknown) =>
  Messages.findById(messageId)
    .populate([{ path: 'sender', select: 'name email profileAvatar role' }])
    .select('text files seen isEdited sender senderType metadata chat createdAt updatedAt')
    .lean();
