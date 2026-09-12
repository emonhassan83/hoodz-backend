import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import {
  buildProductSearchIntentMessages,
  completeWithGemini,
  escapeRegex,
  normalizeSearchIntent,
  parseAiJsonObject,
} from '@/app/modules/aiAssistant/aiAssistant.helpers';
import {
  TAiMessagePayload,
  TAiRequester,
  TAiSearchIntent,
} from '@/app/modules/aiAssistant/aiAssistant.types';
import { CHAT_TYPES } from '@/app/modules/chat/chat.constant';
import { Chat } from '@/app/modules/chat/chat.model';
import { ChatService } from '@/app/modules/chat/chat.services';
import { Messages } from '@/app/modules/messages/messages.model';
import { isChatParticipant } from '@/app/modules/participant/participant.helpers';
import { Product } from '@/app/modules/product/product.model';

const AI_PRODUCT_RESULT_LIMIT = 6;
const productPopulate = [{ path: 'category', select: 'title icon' }];
const productSelect =
  '_id category title inventoryType collectionType brand brandType banner price discount discountPrice stock avgRating ratingCount';

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

/** Builds MongoDB product filters from Gemini search intent. */
const buildProductFilterFromIntent = (intent: TAiSearchIntent) => {
  const filter: Record<string, unknown> = { isDeleted: false };
  const searchParts = [
    intent.searchQuery,
    intent.brand,
    intent.category,
  ].filter(Boolean) as string[];

  if (searchParts.length) {
    const regexes = searchParts.map((part) => new RegExp(escapeRegex(part), 'i'));
    filter.$or = [
      { title: { $in: regexes } },
      { brand: { $in: regexes } },
      { description: { $in: regexes } },
      { 'seo.metaKeywords': { $in: regexes } },
    ];
  }

  if (intent.collectionType) filter.collectionType = intent.collectionType;
  if (intent.brandType) filter.brandType = intent.brandType;
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

/** Loads product cards for AI search results. */
const findAiProducts = async (intent: TAiSearchIntent) => {
  const products = await Product.find(buildProductFilterFromIntent(intent))
    .populate(productPopulate)
    .select(productSelect)
    .sort({ stock: -1, avgRating: -1, ratingCount: -1, sold: -1, createdAt: -1 })
    .limit(AI_PRODUCT_RESULT_LIMIT)
    .lean();

  return products.map((product: Record<string, any>) => ({
    _id: product._id,
    title: product.title,
    brand: product.brand ?? null,
    banner: product.banner ?? null,
    price: product.price ?? 0,
    discountPrice: product.discountPrice ?? product.price ?? 0,
    avgRating: product.avgRating ?? 0,
    ratingCount: product.ratingCount ?? 0,
    category:
      product.category && typeof product.category === 'object'
        ? { title: product.category.title }
        : null,
  }));
};

/** Uses Gemini once to extract product/brand search intent. */
const extractProductSearchIntent = async (traceId: string, message: string) => {
  const result = await completeWithGemini(
    traceId,
    buildProductSearchIntentMessages(message)
  );
  const parsed = parseAiJsonObject<Partial<TAiSearchIntent>>(result.content);

  return {
    provider: result.provider,
    intent: normalizeSearchIntent(parsed, message),
  };
};

/** Creates a deterministic AI text response from backend search results. */
const buildSearchLabel = (intent: TAiSearchIntent) => {
  if (intent.brand) return intent.brand;
  if (intent.brandType) return `${intent.brandType} brands`;
  if (intent.category) return intent.category;
  if (intent.searchQuery) return intent.searchQuery;
  if (intent.minPrice !== null && intent.maxPrice !== null) {
    return `products from ${intent.minPrice} to ${intent.maxPrice}`;
  }
  if (intent.maxPrice !== null) return `products under ${intent.maxPrice}`;
  if (intent.minPrice !== null) return `products over ${intent.minPrice}`;
  return 'your filters';
};

const buildSearchReplyText = (intent: TAiSearchIntent, products: any[]) => {
  const label = buildSearchLabel(intent);

  if (!products.length) {
    return `I could not find products for ${label}. Try a different product, brand, category, or price range.`;
  }

  return `I found ${products.length} result${products.length > 1 ? 's' : ''} for "${label}".`;
};

/** Sends a user message to the AI assistant and stores both sides in messages. */
const sendMessage = async (
  traceId: string,
  requester: TAiRequester,
  payload: TAiMessagePayload
) => {
  const chat = await resolveAiChat(traceId, requester, payload.chatId);
  const chatId = String(chat._id);

  const { provider, intent } = await extractProductSearchIntent(
    traceId,
    payload.message
  );
  const products = await findAiProducts(intent);
  const aiText = buildSearchReplyText(intent, products);

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
    text: aiText,
    metadata: {
      provider,
      intent,
      products,
    },
  });

  return {
    chatId,
    userMessage,
    aiMessage,
    provider,
    intent,
    products,
  };
};

export const AiAssistantService = {
  sendMessage,
};
