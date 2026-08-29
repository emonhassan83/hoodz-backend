import { HttpStatusCode } from 'axios';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import { CHAT_TYPES } from '@/app/modules/chat/chat.constant';
import { Chat } from '@/app/modules/chat/chat.model';
import {
  assertMessageChatAccess,
  getPopulatedMessageById,
  touchChatUpdatedAt,
} from '@/app/modules/messages/messages.helpers';
import { Messages } from '@/app/modules/messages/messages.model';
import {
  getMyParticipantChatIds,
  isChatParticipant,
} from '@/app/modules/participant/participant.helpers';
import { USER_ROLE } from '@/app/modules/user/user.constant';

type TMessageRequester = { userId: string; role: string };

/** Returns paginated messages for a chat, oldest first. */
const getMessagesByChatId = async (
  traceId: string,
  user: TMessageRequester,
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
    Messages.find({ chat: chat._id }).select(
      'text files seen isEdited sender senderType metadata createdAt'
    ),
    { ...query, sort: (query.sort as string) || 'createdAt' }
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const [messages, meta] = await Promise.all([
    messageQuery.modelQuery,
    messageQuery.countTotal(),
  ]);

  return { meta, data: messages };
};

/** Returns paginated user and AI messages from the requester's single AI chat. */
const getAiAssistantMessages = async (
  traceId: string,
  user: TMessageRequester,
  query: Record<string, unknown>
) => {
  const chatIds = await getMyParticipantChatIds(user.userId);
  const chat =
    chatIds.length > 0
      ? await Chat.findOne({
          _id: { $in: chatIds },
          type: CHAT_TYPES.ai_assistant,
        })
          .sort({ createdAt: 1 })
          .select('_id type')
          .lean()
      : null;

  if (!chat) {
    return {
      chat: null,
      meta: { page: 1, limit: Number(query.limit) || 10, total: 0, totalPage: 0 },
      data: [],
    };
  }

  const result = await getMessagesByChatId(traceId, user, chat._id.toString(), query);
  return { chat: { _id: chat._id, type: chat.type }, ...result };
};

/** Creates a user message and refreshes the parent chat list order. */
const sendMessage = async (
  traceId: string,
  user: TMessageRequester,
  payload: { chatId: string; text?: string | null; files?: string[] }
) => {
  await assertMessageChatAccess(traceId, payload.chatId, user);
  const message = await Messages.create({
    chat: payload.chatId,
    sender: user.userId,
    senderType: 'user',
    text: payload.text ?? null,
    files: payload.files ?? [],
  });
  await touchChatUpdatedAt(payload.chatId);
  return getPopulatedMessageById(message._id);
};

/** Edits the sender's own message. */
const editMessage = async (
  traceId: string,
  user: TMessageRequester,
  payload: { messageId: string; text?: string; files?: string[] }
) => {
  const message = await Messages.findById(payload.messageId);
  if (!message) {
    throw new ApiError(HttpStatusCode.NotFound, 'Message not found', traceId);
  }
  if (!message.sender || message.sender.toString() !== user.userId) {
    throw new ApiError(HttpStatusCode.Forbidden, 'You can only edit your own message', traceId);
  }

  await assertMessageChatAccess(traceId, message.chat.toString(), user);
  if (payload.text !== undefined) message.text = payload.text.trim();
  if (payload.files !== undefined) message.files = payload.files;
  message.isEdited = true;
  await message.save();
  await touchChatUpdatedAt(message.chat.toString());
  return getPopulatedMessageById(message._id);
};

/** Deletes the sender's own message. */
const deleteMessage = async (
  traceId: string,
  user: TMessageRequester,
  messageId: string
) => {
  const message = await Messages.findById(messageId);
  if (!message) {
    throw new ApiError(HttpStatusCode.NotFound, 'Message not found', traceId);
  }
  if (!message.sender || message.sender.toString() !== user.userId) {
    throw new ApiError(
      HttpStatusCode.Forbidden,
      'You can only delete your own message',
      traceId
    );
  }

  const chatId = message.chat.toString();
  await assertMessageChatAccess(traceId, chatId, user);
  await Messages.findByIdAndDelete(messageId);
  await touchChatUpdatedAt(chatId);

  return {
    messageId,
    chatId,
    deletedBy: user.userId,
    deletedAt: new Date().toISOString(),
  };
};

/** Marks other people's unseen messages in a chat as seen. */
const markMessagesSeen = async (
  traceId: string,
  user: TMessageRequester,
  chatId: string
) => {
  await assertMessageChatAccess(traceId, chatId, user);
  await Messages.updateMany(
    {
      chat: chatId,
      seen: false,
      sender: { $ne: user.userId },
    },
    { $set: { seen: true } }
  );

  return {
    chatId,
    seenBy: user.userId,
    seenAt: new Date().toISOString(),
  };
};

export const MessagesService = {
  getMessagesByChatId,
  getAiAssistantMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  markMessagesSeen,
};
