import { Types } from 'mongoose';

import {
  AI_INTENT,
  AI_PROVIDER,
} from '@/app/modules/aiAssistant/aiAssistant.constant';

export type TAiProvider = (typeof AI_PROVIDER)[keyof typeof AI_PROVIDER];

export type TAiIntent = (typeof AI_INTENT)[keyof typeof AI_INTENT];

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

export type TAiIntentResult = {
  intent: TAiIntent;
  searchQuery: string;
  category?: string | null;
  brand?: string | null;
  colors?: string[];
  sizes?: string[];
  minPrice?: number | null;
  maxPrice?: number | null;
  collectionType?: 'men' | 'woman' | 'unisex' | null;
};

export type TAiProductCard = {
  _id: Types.ObjectId;
  categoryTitle?: string;
  title: string;
  inventoryType: string;
  collectionType: string;
  images: string[];
  price: number;
  discount: number;
  discountPrice: number;
  stock: number;
  avgRating: number;
  ratingCount: number;
  inStock: boolean;
  isWishlisted: boolean;
};

export type TAiProviderResult = {
  provider: TAiProvider;
  content: string;
};


