import crypto from 'crypto';

import { HttpStatusCode } from 'axios';

import { getRedisClient } from '@/app/configs/redis.config';
import ApiError from '@/app/errors/ApiError';
import {
  buildProductSearchIntentMessages,
  completeWithGemini,
  escapeRegex,
  normalizeSearchIntent,
  parseAiJsonObject,
} from '@/app/modules/aiAssistant/aiAssistant.helpers';
import { TAiRequester, TAiSearchIntent } from '@/app/modules/aiAssistant/aiAssistant.types';
import { ChatService } from '@/app/modules/chat/chat.services';
import { Messages } from '@/app/modules/messages/messages.model';
import { touchChatUpdatedAt } from '@/app/modules/messages/messages.helpers';
import { Product } from '@/app/modules/product/product.model';
import { TAiSendMessagePayload } from '@/app/socket/interface/chatSocket.interface';

const AI_COOLDOWN_SECONDS = 4;
const AI_CACHE_SECONDS = 180;
const AI_PRODUCT_RESULT_LIMIT = 6;
const productPopulate = [{ path: 'category', select: 'title icon' }];
const productSelect =
  '_id category title inventoryType collectionType brand brandType banner price discount discountPrice stock avgRating ratingCount';

/** Finds or creates the socket user's singleton AI assistant chat. */
const resolveAiSocketChat = async (requester: TAiRequester) =>
  ChatService.getOrCreateAiAssistantChat(requester.userId);

/** Stable cache key for repeated user AI prompts. */
const getAiResponseCacheKey = (userId: string, message: string) => {
  const normalized = message.trim().toLowerCase().replace(/\s+/g, ' ');
  const hash = crypto.createHash('sha256').update(normalized).digest('hex');
  return `ai:assistant:response:v6:${userId}:${hash}`;
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

type TAiCachedSearch = {
  provider: 'gemini';
  intent: TAiSearchIntent;
  products: any[];
  content: string;
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

/** Loads product cards for AI socket search results. */
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

/** Uses Gemini once to extract the product/brand search intent. */
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

/** Creates a deterministic AI text response from backend product results. */
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
  const cachedRaw = await redis.get(cacheKey);
  const cachedSearch = cachedRaw
    ? (JSON.parse(cachedRaw) as TAiCachedSearch)
    : null;
  let resolvedSearch: TAiCachedSearch;

  if (cachedSearch) {
    resolvedSearch = cachedSearch;
  } else {
    const { provider, intent } = await extractProductSearchIntent(traceId, message);
    const products = await findAiProducts(intent);
    const content = buildSearchReplyText(intent, products);
    resolvedSearch = { provider, intent, products, content };
  }

  if (!cachedSearch) {
    await redis.set(cacheKey, JSON.stringify(resolvedSearch), 'EX', AI_CACHE_SECONDS);
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
    text: resolvedSearch.content,
    metadata: {
      provider: resolvedSearch.provider,
      cached: Boolean(cachedSearch),
      intent: resolvedSearch.intent,
      products: resolvedSearch.products,
    },
  });
  await touchChatUpdatedAt(chatId);

  return {
    chatId,
    userMessage,
    aiMessage,
    provider: resolvedSearch.provider,
    intent: resolvedSearch.intent,
    products: resolvedSearch.products,
  };
};
