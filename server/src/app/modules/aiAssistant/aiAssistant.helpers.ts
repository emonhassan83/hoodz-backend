import axios, { AxiosError, HttpStatusCode } from 'axios';

import { env } from '@/app/configs/env.configs';
import ApiError from '@/app/errors/ApiError';
import {
  AI_INTENT,
  AI_PROVIDER,
  AI_PROVIDER_MODE,
} from '@/app/modules/aiAssistant/aiAssistant.constant';
import {
  TAiChatMessage,
  TAiIntentResult,
  TAiProductCard,
  TAiProvider,
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
  brand: intent.brand ?? null,
  colors: Array.isArray(intent.colors) ? intent.colors : [],
  sizes: Array.isArray(intent.sizes) ? intent.sizes : [],
  minPrice: typeof intent.minPrice === 'number' ? intent.minPrice : null,
  maxPrice: typeof intent.maxPrice === 'number' ? intent.maxPrice : null,
  collectionType: intent.collectionType ?? null,
});

/** Builds the provider order from env so fallback can run automatically. */
const getProviderOrder = (): TAiProvider[] => {
  const primary = (env.AI_PROVIDER || AI_PROVIDER.groq) as TAiProvider;
  const fallback = (env.AI_FALLBACK_PROVIDER || AI_PROVIDER.gemini) as TAiProvider;

  if (env.AI_PROVIDER_MODE === AI_PROVIDER_MODE.manual) return [primary];
  return [...new Set([primary, fallback])];
};

/** Returns true when an AI provider error should move to the fallback provider. */
const shouldFallback = (error: unknown) => {
  const axiosError = error as AxiosError;
  const status = axiosError.response?.status;
  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    axiosError.code === 'ECONNABORTED'
  );
};

/** Calls Groq OpenAI-compatible chat completion API. */
const callGroq = async (messages: TAiChatMessage[]) => {
  if (!env.GROQ_API_KEY) {
    throw new ApiError(HttpStatusCode.ServiceUnavailable, 'Groq API key is not configured');
  }

  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: env.GROQ_MODEL,
      messages,
      temperature: 0.2,
      max_tokens: 800,
    },
    {
      timeout: aiTimeoutMs,
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return String(response.data?.choices?.[0]?.message?.content || '').trim();
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

/** Calls configured AI providers and automatically falls back on limit/server errors. */
export const completeWithAiProvider = async (
  traceId: string,
  messages: TAiChatMessage[]
): Promise<TAiProviderResult> => {
  const providers = getProviderOrder();
  let lastError: unknown;

  for (const provider of providers) {
    try {
      const content =
        provider === AI_PROVIDER.groq
          ? await callGroq(messages)
          : await callGemini(messages);

      if (!content) throw new Error(`${provider} returned empty content`);
      return { provider, content };
    } catch (error) {
      lastError = error;
      if (!shouldFallback(error) && !(error instanceof ApiError)) break;
    }
  }

  const message =
    lastError instanceof ApiError
      ? lastError.message
      : 'AI assistant is unavailable right now';
  throw new ApiError(HttpStatusCode.ServiceUnavailable, message, traceId);
};

/** Builds a strict JSON prompt for ecommerce intent extraction. */
export const buildIntentMessages = (message: string): TAiChatMessage[] => [
  {
    role: 'system',
    content:
      'You are Hoodz Backend ecommerce AI. Extract product search intent only. Return ONLY valid JSON. No markdown. JSON shape: {"intent":"product_search|product_compare|styling_advice|policy_question|general","searchQuery":"","category":null,"brand":null,"colors":[],"sizes":[],"minPrice":null,"maxPrice":null,"collectionType":"men|woman|unisex|null"}. Use null when unknown.',
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


