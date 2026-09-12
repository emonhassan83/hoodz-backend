import axios, { AxiosError, HttpStatusCode, isAxiosError } from 'axios';

import { env } from '@/app/configs/env.configs';
import ApiError from '@/app/errors/ApiError';
import { AI_PROVIDER } from '@/app/modules/aiAssistant/aiAssistant.constant';
import {
  TAiChatMessage,
  TAiProviderResult,
  TAiSearchIntent,
} from '@/app/modules/aiAssistant/aiAssistant.types';
import { PRODUCT_BRAND_TYPE } from '@/app/modules/product/product.constant';

const aiTimeoutMs = 30000;

const getGeminiErrorMessage = (error: unknown) => {
  if (error instanceof ApiError) return error.message;

  if (isAxiosError(error)) {
    const axiosError = error as AxiosError<{
      error?: { message?: string; status?: string; code?: number };
    }>;
    const apiMessage = axiosError.response?.data?.error?.message?.trim();

    if (axiosError.code === 'ECONNABORTED') {
      return 'Gemini request timed out. Please try again.';
    }
    if (axiosError.response?.status === 429) {
      return 'AI is busy right now. Please try again shortly.';
    }
    if (apiMessage) return apiMessage;
  }

  if (error instanceof Error && error.message) {
    if (error.message === 'gemini returned empty content') {
      return 'Gemini returned an empty response. Please try again.';
    }
    return error.message;
  }

  return 'AI assistant is unavailable right now';
};

/** Calls Google Gemini generateContent API. */
const callGemini = async (messages: TAiChatMessage[]) => {
  if (!env.GEMINI_API_KEY) {
    throw new ApiError(HttpStatusCode.ServiceUnavailable, 'Gemini API key is not configured');
  }

  const contents = messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }));
  const systemInstruction = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n');

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`,
    {
      systemInstruction: systemInstruction
        ? { parts: [{ text: systemInstruction }] }
        : undefined,
      contents,
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 320,
      },
    },
    {
      timeout: aiTimeoutMs,
      params: { key: env.GEMINI_API_KEY },
      headers: { 'Content-Type': 'application/json' },
    }
  );

  const candidate = response.data?.candidates?.[0];
  const text = String(candidate?.content?.parts?.[0]?.text || '').trim();

  if (text) return text;

  const finishReason = candidate?.finishReason;
  if (finishReason && finishReason !== 'STOP') {
    throw new Error(`Gemini blocked the response (${finishReason})`);
  }

  throw new Error('gemini returned empty content');
};

/** Completes a chat turn with Gemini. */
export const completeWithGemini = async (
  traceId: string,
  messages: TAiChatMessage[]
): Promise<TAiProviderResult> => {
  try {
    const content = await callGemini(messages);
    if (!content) throw new Error('gemini returned empty content');
    return { provider: AI_PROVIDER.gemini, content };
  } catch (error) {
    const message = getGeminiErrorMessage(error);
    console.error('[AI Assistant] Gemini request failed:', {
      traceId,
      message,
      error,
    });
    throw new ApiError(HttpStatusCode.ServiceUnavailable, message, traceId);
  }
};

/** Extracts the first JSON object from a Gemini response. */
export const parseAiJsonObject = <T>(content: string): T => {
  const cleanContent = content.replace(/```json|```/g, '').trim();
  const startIndex = cleanContent.indexOf('{');
  const endIndex = cleanContent.lastIndexOf('}');

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error('AI did not return JSON');
  }

  return JSON.parse(cleanContent.slice(startIndex, endIndex + 1)) as T;
};

/** Escapes text before it is used inside MongoDB regex filters. */
export const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const GENERIC_SEARCH_WORDS = new Set([
  'any',
  'product',
  'products',
  'item',
  'items',
  'app',
  'share',
  'show',
  'find',
  'give',
  'need',
  'want',
  'could',
  'please',
  'under',
  'below',
  'less',
  'than',
  'brand',
  'brands',
]);

const brandTypeAliases: Record<string, TAiSearchIntent['brandType']> = {
  local: PRODUCT_BRAND_TYPE.local,
  locals: PRODUCT_BRAND_TYPE.local,
  international: PRODUCT_BRAND_TYPE.international,
  internationals: PRODUCT_BRAND_TYPE.international,
  trending: PRODUCT_BRAND_TYPE.trending,
  trend: PRODUCT_BRAND_TYPE.trending,
  new: PRODUCT_BRAND_TYPE.new,
  latest: PRODUCT_BRAND_TYPE.new,
};

const normalizeBrandType = (
  value?: string | null,
  fallbackMessage?: string
): TAiSearchIntent['brandType'] => {
  const directValue = String(value || '').trim().toLowerCase();
  if (directValue && directValue in brandTypeAliases) {
    return brandTypeAliases[directValue];
  }

  const text = String(fallbackMessage || '').toLowerCase();
  if (/\binternational\s+brands?\b/.test(text)) return PRODUCT_BRAND_TYPE.international;
  if (/\blocal\s+brands?\b/.test(text)) return PRODUCT_BRAND_TYPE.local;
  if (/\btrending\s+brands?\b/.test(text)) return PRODUCT_BRAND_TYPE.trending;
  if (/\b(new|latest)\s+brands?\b/.test(text)) return PRODUCT_BRAND_TYPE.new;

  return null;
};

const normalizeCollectionType = (
  value?: string | null
): TAiSearchIntent['collectionType'] => {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'men' || text === 'man' || text === 'male') return 'men';
  if (text === 'women' || text === 'woman' || text === 'female') return 'women';
  if (text === 'unisex') return 'unisex';
  return null;
};

const clearBrandTypeOnlySearch = (
  searchQuery: string,
  brandType: TAiSearchIntent['brandType']
) => {
  if (!brandType) return searchQuery;

  const words = searchQuery
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (
    words.length > 0 &&
    words.every((word) => GENERIC_SEARCH_WORDS.has(word) || word in brandTypeAliases)
  ) {
    return '';
  }

  return searchQuery;
};

/** Drops sentence-like generic text so filters such as price can work alone. */
export const normalizeSearchQueryText = (value?: string | null) => {
  const text = String(value || '').trim();
  if (!text) return '';

  const words = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length > 5) return '';
  if (words.length > 0 && words.every((word) => GENERIC_SEARCH_WORDS.has(word))) {
    return '';
  }

  return text;
};

/** Normalizes Gemini product/brand search intent for backend retrieval. */
export const normalizeSearchIntent = (
  intent: Partial<TAiSearchIntent>,
  fallbackMessage: string
): TAiSearchIntent => {
  const brandType = normalizeBrandType(intent.brandType, fallbackMessage);
  const searchQuery = normalizeSearchQueryText(intent.searchQuery || fallbackMessage);

  return {
    searchQuery: clearBrandTypeOnlySearch(searchQuery, brandType),
    brand: intent.brand ? String(intent.brand).trim() : null,
    brandType,
    category: intent.category ? String(intent.category).trim() : null,
    colors: Array.isArray(intent.colors)
      ? intent.colors.map(String).filter(Boolean)
      : [],
    sizes: Array.isArray(intent.sizes)
      ? intent.sizes.map(String).filter(Boolean)
      : [],
    collectionType: normalizeCollectionType(intent.collectionType),
    minPrice: typeof intent.minPrice === 'number' ? intent.minPrice : null,
    maxPrice: typeof intent.maxPrice === 'number' ? intent.maxPrice : null,
  };
};

/** Builds a strict Gemini prompt for product/brand search retrieval intent. */
export const buildProductSearchIntentMessages = (
  userMessage: string
): TAiChatMessage[] => [
  {
    role: 'system',
    content:
      'You are Hoodz ecommerce AI. Extract product or brand search parameters. Return ONLY valid JSON. No markdown. JSON shape: {"searchQuery":"","brand":null,"brandType":null,"category":null,"colors":[],"sizes":[],"collectionType":null,"minPrice":null,"maxPrice":null}. brandType must be "local", "international", "trending", "new", or null. collectionType must be "men", "women", "unisex", or null. If user says local/international/trending/new brand, set brandType and keep brand null unless a specific brand name is mentioned. Put only main product, category, or specific brand words in searchQuery. If the user asks generic requests like "any product under 500", keep searchQuery as an empty string and only set price filters.',
  },
  { role: 'user', content: userMessage },
];
