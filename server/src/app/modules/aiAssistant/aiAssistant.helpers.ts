import axios, { HttpStatusCode } from 'axios';

import { env } from '@/app/configs/env.configs';
import ApiError from '@/app/errors/ApiError';
import {
  AI_INTENT,
  AI_PROVIDER,
} from '@/app/modules/aiAssistant/aiAssistant.constant';
import {
  TAiChatMessage,
  TAiIntentResult,
  TAiProductCard,
  TAiProviderResult,
} from '@/app/modules/aiAssistant/aiAssistant.types';

const aiTimeoutMs = 15000;

/** Escapes user text before using it inside MongoDB regex filters. */
export const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Extracts the first JSON object from a model response. */
export const parseAiJsonObject = <T>(content: string): T => {
  const cleanContent = content.replace(/```json|```/g, '').trim();
  const startIndex = cleanContent.indexOf('{');
  const endIndex = cleanContent.lastIndexOf('}');

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error('AI did not return JSON');
  }

  return JSON.parse(cleanContent.slice(startIndex, endIndex + 1)) as T;
};

/** Normalizes extracted intent so downstream product search gets safe defaults. */
export const normalizeIntent = (
  intent: Partial<TAiIntentResult>,
  fallbackMessage: string
): TAiIntentResult => ({
  intent: intent.intent || AI_INTENT.general,
  searchQuery: intent.searchQuery || fallbackMessage,
  category: intent.category ?? null,
  colors: Array.isArray(intent.colors) ? intent.colors : [],
  sizes: Array.isArray(intent.sizes) ? intent.sizes : [],
  minPrice: typeof intent.minPrice === 'number' ? intent.minPrice : null,
  maxPrice: typeof intent.maxPrice === 'number' ? intent.maxPrice : null,
  collectionType: intent.collectionType ?? null,
});

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
        temperature: 0.2,
        maxOutputTokens: 800,
      },
    },
    {
      timeout: aiTimeoutMs,
      params: { key: env.GEMINI_API_KEY },
      headers: { 'Content-Type': 'application/json' },
    }
  );

  return String(response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
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
    const message =
      error instanceof ApiError
        ? error.message
        : 'AI assistant is unavailable right now';
    throw new ApiError(HttpStatusCode.ServiceUnavailable, message, traceId);
  }
};

/** Builds a strict JSON prompt for ecommerce intent extraction. */
export const buildIntentMessages = (message: string): TAiChatMessage[] => [
  {
    role: 'system',
    content:
      'You are Hoodz Backend ecommerce AI. Extract product search intent only. Return ONLY valid JSON. No markdown. JSON shape: {"intent":"product_search|product_compare|styling_advice|policy_question|general","searchQuery":"","category":null,"colors":[],"sizes":[],"minPrice":null,"maxPrice":null,"collectionType":"men|woman|unisex|null"}. Use null when unknown.',
  },
  { role: 'user', content: message },
];

/** Builds a short shopping reply prompt grounded only in backend product results. */
export const buildAssistantReplyMessages = (
  userMessage: string,
  intent: TAiIntentResult,
  products: TAiProductCard[]
): TAiChatMessage[] => [
  {
    role: 'system',
    content:
      'You are a concise ecommerce shopping assistant for Hoodz. Do not invent products, prices, stock, or discounts. Keep response short. Mention products only from the given JSON. If no products found, suggest refining search.',
  },
  {
    role: 'user',
    content: JSON.stringify({
      userMessage,
      extractedIntent: intent,
      products,
    }),
  },
];



