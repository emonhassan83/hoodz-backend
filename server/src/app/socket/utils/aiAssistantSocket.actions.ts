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
  TAiRequester,
} from '@/app/modules/aiAssistant/aiAssistant.types';
import { CHAT_STATUS, CHAT_TYPES } from '@/app/modules/chat/chat.constant';
import { Chat } from '@/app/modules/chat/chat.model';
import { Messages } from '@/app/modules/messages/messages.model';
import {
  getMyParticipantChatIds,
  isChatParticipant,
  syncChatParticipants,
} from '@/app/modules/participant/participant.helpers';
import {
  formatProductListItems,
  getWishlistProductIdSet,
} from '@/app/modules/product/product.helpers';
import { Product } from '@/app/modules/product/product.model';
import { TAiSendMessagePayload } from '@/app/socket/interface/chatSocket.interface';

const productPopulate = [{ path: 'category', select: 'title icon' }];
const productSelect =
  '_id category title inventoryType collectionType images price discount discountPrice stock avgRating ratingCount brand colors sizes';

/** Finds or creates the socket user's singleton AI assistant chat. */
const resolveAiSocketChat = async (
  traceId: string,
  requester: TAiRequester,
  chatId?: string
) => {
  if (!chatId) {
    const chatIds = await getMyParticipantChatIds(requester.userId);
    const existingChat =
      chatIds.length > 0
        ? await Chat.findOne({ _id: { $in: chatIds }, type: CHAT_TYPES.ai_assistant })
        : null;
    const chat =
      existingChat ||
      (await Chat.create({
        type: CHAT_TYPES.ai_assistant,
        order: null,
        status: CHAT_STATUS.active,
      }));

    await syncChatParticipants(chat!._id, [requester.userId]);
    return chat;
  }

  const chat = await Chat.findById(chatId).select('type').lean();
  if (!chat) {
    throw new ApiError(HttpStatusCode.NotFound, 'AI chat not found', traceId);
  }
  if (chat.type !== CHAT_TYPES.ai_assistant) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Chat is not an AI assistant chat', traceId);
  }
  if (!(await isChatParticipant(chatId, requester.userId))) {
    throw new ApiError(HttpStatusCode.Forbidden, 'You cannot access this chat', traceId);
  }

  return chat;
};

/** Builds MongoDB filters from extracted AI shopping intent. */
const buildProductFilterFromIntent = (intent: TAiIntentResult) => {
  const filter: Record<string, unknown> = { isDeleted: false };
  const searchTerm = intent.searchQuery?.trim();

  if (searchTerm) {
    const regex = new RegExp(escapeRegex(searchTerm), 'i');
    filter.$or = [
      { title: regex },
      { brand: regex },
      { description: regex },
      { 'seo.metaKeywords': regex },
    ];
  }
  if (intent.brand) filter.brand = new RegExp(escapeRegex(intent.brand), 'i');
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

/** Loads product cards using backend-controlled AI intent filters. */
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

/** Extracts shopping intent through the configured AI provider. */
const extractShoppingIntent = async (traceId: string, message: string) => {
  const result = await completeWithAiProvider(traceId, buildIntentMessages(message));
  const parsed = parseAiJsonObject<Partial<TAiIntentResult>>(result.content);

  return {
    provider: result.provider,
    intent: normalizeIntent(parsed, message),
  };
};

/** Sends a socket AI message and stores both user and AI messages. */
export const sendAiSocketMessage = async (
  traceId: string,
  requester: TAiRequester,
  payload: TAiSendMessagePayload
) => {
  const chat = await resolveAiSocketChat(traceId, requester, payload.chatId);
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
