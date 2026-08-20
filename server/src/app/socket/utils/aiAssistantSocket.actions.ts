import {
  buildAssistantReplyMessages,
  buildIntentMessages,
  completeWithGemini,
  escapeRegex,
  normalizeIntent,
  parseAiJsonObject,
} from '@/app/modules/aiAssistant/aiAssistant.helpers';
import {
  TAiIntentResult,
  TAiRequester,
} from '@/app/modules/aiAssistant/aiAssistant.types';
import { ChatService } from '@/app/modules/chat/chat.services';
import { Messages } from '@/app/modules/messages/messages.model';
import { touchChatUpdatedAt } from '@/app/modules/messages/messages.helpers';
import {
  formatProductListItems,
  getWishlistProductIdSet,
} from '@/app/modules/product/product.helpers';
import { Product } from '@/app/modules/product/product.model';
import { TAiSendMessagePayload } from '@/app/socket/interface/chatSocket.interface';

const productPopulate = [{ path: 'category', select: 'title icon' }];
const productSelect =
  '_id category title inventoryType collectionType banner price discount discountPrice stock avgRating ratingCount colors sizes';

/** Finds or creates the socket user's singleton AI assistant chat. */
const resolveAiSocketChat = async (requester: TAiRequester) =>
  ChatService.getOrCreateAiAssistantChat(requester.userId);

/** Builds MongoDB filters from extracted AI shopping intent. */
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
  const result = await completeWithGemini(traceId, buildIntentMessages(message));
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
  const chat = await resolveAiSocketChat(requester);
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
  const replyResult = await completeWithGemini(
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
    },
  });
  await touchChatUpdatedAt(chatId);

  return {
    chatId,
    userMessage,
    aiMessage,
    provider: replyResult.provider,
    intentProvider,
    intent,
    products,
  };
};
