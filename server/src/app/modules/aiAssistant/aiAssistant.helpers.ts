import axios, { AxiosError, HttpStatusCode, isAxiosError } from 'axios';

import { env } from '@/app/configs/env.configs';
import ApiError from '@/app/errors/ApiError';
import { AI_PROVIDER } from '@/app/modules/aiAssistant/aiAssistant.constant';
import {
  TAiChatMessage,
  TAiProviderResult,
} from '@/app/modules/aiAssistant/aiAssistant.types';

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

/** Builds a compact Gemini prompt for plain AI shopping chat. */
export const buildAssistantChatMessages = (
  userMessage: string,
  history: TAiChatMessage[] = []
): TAiChatMessage[] => [
  {
    role: 'system',
    content:
      'You are Hoodz, a concise ecommerce shopping assistant. Give short, practical style and shopping guidance. Do not claim live stock, exact prices, discounts, or availability. If the user needs real products, tell them to search or open product listings in the app.',
  },
  ...history.slice(-8),
  { role: 'user', content: userMessage },
];

