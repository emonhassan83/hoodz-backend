import { AI_PROVIDER } from '@/app/modules/aiAssistant/aiAssistant.constant';

export type TAiProvider = (typeof AI_PROVIDER)[keyof typeof AI_PROVIDER];

export type TAiRequester = {
  userId: string;
  role: string;
};

export type TAiMessagePayload = {
  chatId?: string;
  message: string;
};

export type TAiChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type TAiSearchIntent = {
  searchQuery: string;
  brand?: string | null;
  brandType?: 'local' | 'international' | 'trending' | 'new' | null;
  category?: string | null;
  colors?: string[];
  sizes?: string[];
  collectionType?: 'men' | 'women' | 'unisex' | null;
  minPrice?: number | null;
  maxPrice?: number | null;
};

export type TAiProviderResult = {
  provider: TAiProvider;
  content: string;
};

