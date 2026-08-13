import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import {
  buildAssistantReplyMessages,
  buildIntentMessages,
  completeWithAiProvider,
  escapeRegex,
  normalizeIntent,
  parseAiJsonObject,
} from '@/app/modules/aiAssistant/aiAssistant.helpers';
import {
  TAiIntentResult,
  TAiMessagePayload,
  TAiRequester,
} from '@/app/modules/aiAssistant/aiAssistant.types';
import { CHAT_TYPES } from '@/app/modules/chat/chat.constant';
import { Chat } from '@/app/modules/chat/chat.model';
import { ChatService } from '@/app/modules/chat/chat.services';
import { Messages } from '@/app/modules/messages/messages.model';
import { isChatParticipant } from '@/app/modules/participant/participant.helpers';
import {
  formatProductListItems,
  getWishlistProductIdSet,
} from '@/app/modules/product/product.helpers';
import { Product } from '@/app/modules/product/product.model';

const productPopulate = [{ path: 'category', select: 'title icon' }];
const productSelect =
  '_id category title inventoryType collectionType banner price discount discountPrice stock avgRating ratingCount colors sizes';

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

/** Builds MongoDB filters from extracted shopping intent. */
const buildProductFilterFromIntent = (intent: TAiIntentResult) => {
  const filter: Record<string, unknown> = { isDeleted: false };
  const searchTerm = intent.searchQuery?.trim();

  if (searchTerm) {
    const regex = new RegExp(escapeRegex(searchTerm), 'i');
    filter.$or = [
      { title: regex },
      { description: regex },
      { 'seo.metaKeywords': regex },
    ];
  }
  if (intent.collectionType) filter.collectionType = intent.collectionType;
  if (intent.colors?.length) {
    filter['colors.name'] = {
      $in: intent.colors.map((color) => new RegExp(`^${escapeRegex(color)}$`, 'i')),
    };
  }
  if (intent.sizes?.length) filter.sizes = { $in: intent.sizes };
  if (intent.minPrice !== null || intent.maxPrice !== null) {
    filter.discountPrice = {
      ...(intent.minPrice !== null ? { $gte: intent.minPrice } : {}),
      ...(intent.maxPrice !== null ? { $lte: intent.maxPrice } : {}),
    };
  }

  return filter;
};

/** Loads product cards from MongoDB using backend-controlled AI intent filters. */
const findSuggestedProducts = async (
  userId: string,
  intent: TAiIntentResult
) => {
  const products = await Product.find(buildProductFilterFromIntent(intent))
    .populate(productPopulate)
    .select(productSelect)
    .sort({ stock: -1, avgRating: -1, ratingCount: -1, sold: -1, createdAt: -1 })
    .limit(8)
    .lean();

  const wishlistIds = await getWishlistProductIdSet(userId);
  return formatProductListItems(products, wishlistIds);
};

/** Gets a model-extracted intent with fallback-safe normalization. */
const extractShoppingIntent = async (traceId: string, message: string) => {
  const result = await completeWithAiProvider(traceId, buildIntentMessages(message));
  const parsed = parseAiJsonObject<Partial<TAiIntentResult>>(result.content);

  return {
    provider: result.provider,
    intent: normalizeIntent(parsed, message),
  };
};

/** Sends a user message to the AI assistant and stores both sides in messages. */
const sendMessage = async (
  traceId: string,
  requester: TAiRequester,
  payload: TAiMessagePayload
) => {
  const chat = await resolveAiChat(traceId, requester, payload.chatId);
  const chatId = String(chat._id);

  const userMessage = await Messages.create({
    chat: chatId,
    sender: requester.userId,
    senderType: 'user',
    text: payload.message,
  });

  const { provider: intentProvider, intent } = await extractShoppingIntent(
    traceId,
    payload.message
  );
  const products = await findSuggestedProducts(requester.userId, intent);
  const replyResult = await completeWithAiProvider(
    traceId,
    buildAssistantReplyMessages(payload.message, intent, products)
  );

  const aiMessage = await Messages.create({
    chat: chatId,
    sender: null,
    senderType: 'ai',
    text: replyResult.content,
    metadata: {
      intent,
      products: products.map((product) => product._id),
      provider: replyResult.provider,
      intentProvider,
      fallbackUsed: intentProvider !== replyResult.provider,
    },
  });

  return {
    chatId,
    userMessage,
    aiMessage,
    provider: replyResult.provider,
    intentProvider,
    fallbackUsed: intentProvider !== replyResult.provider,
    intent,
    products,
  };
};

export const AiAssistantService = {
  sendMessage,
};



