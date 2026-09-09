import crypto from 'crypto';

import { HttpStatusCode } from 'axios';

import { getRedisClient } from '@/app/configs/redis.config';
import ApiError from '@/app/errors/ApiError';
import {
  buildAssistantChatMessages,
  completeWithGemini,
} from '@/app/modules/aiAssistant/aiAssistant.helpers';
import { TAiChatMessage, TAiRequester } from '@/app/modules/aiAssistant/aiAssistant.types';
import { ChatService } from '@/app/modules/chat/chat.services';
import { Messages } from '@/app/modules/messages/messages.model';
import { touchChatUpdatedAt } from '@/app/modules/messages/messages.helpers';
import { TAiSendMessagePayload } from '@/app/socket/interface/chatSocket.interface';

const AI_COOLDOWN_SECONDS = 4;
const AI_CACHE_SECONDS = 180;

/** Finds or creates the socket user's singleton AI assistant chat. */
const resolveAiSocketChat = async (requester: TAiRequester) =>
  ChatService.getOrCreateAiAssistantChat(requester.userId);

/** Stable cache key for repeated user AI prompts. */
const getAiResponseCacheKey = (userId: string, message: string) => {
  const normalized = message.trim().toLowerCase().replace(/\s+/g, ' ');
  const hash = crypto.createHash('sha256').update(normalized).digest('hex');
  return `ai:assistant:response:${userId}:${hash}`;
};

/** Blocks rapid repeated AI messages from the same user. */
const assertAiCooldown = async (userId: string) => {
  const redis = getRedisClient();
  const key = `ai:assistant:cooldown:${userId}`;
  const isAllowed = await redis.set(key, '1', 'EX', AI_COOLDOWN_SECONDS, 'NX');

  if (!isAllowed) {
    throw new ApiError(
      HttpStatusCode.TooManyRequests,
      `Please wait ${AI_COOLDOWN_SECONDS} seconds before sending another AI message`
    );
  }
};

/** Loads only recent AI chat context to control Gemini token usage. */
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

/** Sends a socket AI message and stores both user and AI messages. */
export const sendAiSocketMessage = async (
  traceId: string,
  requester: TAiRequester,
  payload: TAiSendMessagePayload
) => {
  const message = payload.message.trim();
  await assertAiCooldown(requester.userId);

  const chat = await resolveAiSocketChat(requester);
  const chatId = String(chat._id);
  const redis = getRedisClient();
  const cacheKey = getAiResponseCacheKey(requester.userId, message);
  const cachedReply = await redis.get(cacheKey);
  const history = cachedReply ? [] : await getRecentAiMessages(chatId);

  const replyResult = cachedReply
    ? { provider: 'gemini' as const, content: cachedReply }
    : await completeWithGemini(
        traceId,
        buildAssistantChatMessages(message, history)
      );

  if (!cachedReply) {
    await redis.set(cacheKey, replyResult.content, 'EX', AI_CACHE_SECONDS);
  }

  const userMessage = await Messages.create({
    chat: chatId,
    sender: requester.userId,
    senderType: 'user',
    text: message,
  });

  const aiMessage = await Messages.create({
    chat: chatId,
    sender: null,
    senderType: 'ai',
    text: replyResult.content,
    metadata: {
      provider: replyResult.provider,
      cached: Boolean(cachedReply),
    },
  });
  await touchChatUpdatedAt(chatId);

  return {
    chatId,
    userMessage,
    aiMessage,
    provider: replyResult.provider,
  };
};
