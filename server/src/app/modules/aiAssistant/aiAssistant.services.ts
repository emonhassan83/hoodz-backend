import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import {
  buildAssistantChatMessages,
  completeWithGemini,
} from '@/app/modules/aiAssistant/aiAssistant.helpers';
import {
  TAiChatMessage,
  TAiMessagePayload,
  TAiRequester,
} from '@/app/modules/aiAssistant/aiAssistant.types';
import { CHAT_TYPES } from '@/app/modules/chat/chat.constant';
import { Chat } from '@/app/modules/chat/chat.model';
import { ChatService } from '@/app/modules/chat/chat.services';
import { Messages } from '@/app/modules/messages/messages.model';
import { isChatParticipant } from '@/app/modules/participant/participant.helpers';

/** Finds or creates the authenticated user's AI assistant chat. */
const resolveAiChat = async (
  traceId: string,
  requester: TAiRequester,
  chatId?: string
) => {
  if (!chatId) {
    const chat = await ChatService.createChat(traceId, requester, {
      type: CHAT_TYPES.ai_assistant,
    });
    return chat;
  }

  const chat = await Chat.findById(chatId).select('type').lean();
  if (!chat) {
    throw new ApiError(HttpStatusCode.NotFound, 'AI chat not found', traceId);
  }
  if (chat.type !== CHAT_TYPES.ai_assistant) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Chat is not an AI assistant chat', traceId);
  }

  const isParticipant = await isChatParticipant(chatId, requester.userId);
  if (!isParticipant) {
    throw new ApiError(HttpStatusCode.Forbidden, 'You cannot access this chat', traceId);
  }

  return chat;
};

/** Loads only recent AI chat context to keep Gemini token usage small. */
const getRecentAiMessages = async (chatId: string): Promise<TAiChatMessage[]> => {
  const messages = await Messages.find({
    chat: chatId,
    text: { $ne: null },
    senderType: { $in: ['user', 'ai'] },
  })
    .select('text senderType createdAt')
    .sort({ createdAt: -1 })
    .limit(8)
    .lean();

  return messages.reverse().map((message) => ({
    role: message.senderType === 'ai' ? 'assistant' : 'user',
    content: String(message.text || ''),
  }));
};

/** Sends a user message to the AI assistant and stores both sides in messages. */
const sendMessage = async (
  traceId: string,
  requester: TAiRequester,
  payload: TAiMessagePayload
) => {
  const chat = await resolveAiChat(traceId, requester, payload.chatId);
  const chatId = String(chat._id);

  const history = await getRecentAiMessages(chatId);
  const replyResult = await completeWithGemini(
    traceId,
    buildAssistantChatMessages(payload.message, history)
  );

  const userMessage = await Messages.create({
    chat: chatId,
    sender: requester.userId,
    senderType: 'user',
    text: payload.message,
  });

  const aiMessage = await Messages.create({
    chat: chatId,
    sender: null,
    senderType: 'ai',
    text: replyResult.content,
    metadata: {
      provider: replyResult.provider,
    },
  });

  return {
    chatId,
    userMessage,
    aiMessage,
    provider: replyResult.provider,
  };
};

export const AiAssistantService = {
  sendMessage,
};
