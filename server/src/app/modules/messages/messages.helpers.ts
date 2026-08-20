import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { Chat } from '@/app/modules/chat/chat.model';
import { Messages } from '@/app/modules/messages/messages.model';
import { isChatParticipant } from '@/app/modules/participant/participant.helpers';
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
  const isParticipant = await isChatParticipant(chatId, user.userId);
  if (!isAdmin && !isParticipant) {
    throw new ApiError(HttpStatusCode.Forbidden, 'You cannot access this chat', traceId);
  }

  return chat;
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
