import { HttpStatusCode } from 'axios';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import { Chat } from '@/app/modules/chat/chat.model';
import { Messages } from '@/app/modules/messages/messages.model';
import { isChatParticipant } from '@/app/modules/participant/participant.helpers';
import { USER_ROLE } from '@/app/modules/user/user.constant';

/** Returns paginated messages for a chat from newest page order to oldest. */
const getMessagesByChatId = async (
  traceId: string,
  user: { userId: string; role: string },
  chatId: string,
  query: Record<string, unknown>
) => {
  const chat = await Chat.findById(chatId);
  if (!chat) {
    throw new ApiError(HttpStatusCode.NotFound, 'Chat not found', traceId);
  }

  const isAdmin = user.role === USER_ROLE.admin;
  const isParticipant = await isChatParticipant(chatId, user.userId);
  if (!isAdmin && !isParticipant) {
    throw new ApiError(HttpStatusCode.Forbidden, 'You cannot access this chat', traceId);
  }

  const messageQuery = new QueryBuilder(
    Messages.find({ chat: chat._id })
      .select('text files seen isEdited sender senderType metadata createdAt')
      .sort({ createdAt: 1 }),
    query
  )
    .filter()
    .paginate()
    .fields();

  const [messages, meta] = await Promise.all([
    messageQuery.modelQuery,
    messageQuery.countTotal(),
  ]);

  return { meta, data: [...messages].reverse() };
};

export const MessagesService = {
  getMessagesByChatId,
};


