import { Types } from 'mongoose';

import { SEARCH_SOURCE } from '@/app/modules/search/search.constant';

export type TSearch = {
  _id?: string;
  userId?: Types.ObjectId;
  guestId?: string;
  query: string;
  normalizedQuery: string;
  source: SEARCH_SOURCE;
  resultCount: number;
  lastSearchedAt: Date;
};

export type TSearchActor = {
  userId?: string;
  guestId?: string;
};

export type TSearchQuery = {
  searchTerm?: string;
  category?: string;
  brand?: string;
  collectionType?: string;
  size?: string;
  color?: string;
  minPrice?: string | number;
  maxPrice?: string | number;
  inStock?: string | boolean;
  sortBy?: 'relevance' | 'latest' | 'priceLowToHigh' | 'priceHighToLow';
};

export type TInsertSearchPayload = {
  query: string;
  source?: SEARCH_SOURCE;
};

export type TTypesenseProductDocument = {
  id: string;
  title: string;
  brand: string;
  description: string;
  sku: string;
  categoryId: string;
  categoryTitle: string;
  vendorId: string;
  vendorName: string;
  collectionType: string;
  images: string[];
  sizes: string[];
  colors: string[];
  price: number;
  discountPrice: number;
  stock: number;
  avgRating: number;
  ratingCount: number;
  sold: number;
  inStock: boolean;
  seoKeywords: string[];
  createdAt: number;
};

export type TTypesenseSearchResult<T> = {
  found: number;
  page: number;
  hits?: Array<{ document: T }>;
  facet_counts?: Array<{
    field_name: string;
    counts: Array<{ value: string; count: number }>;
  }>;
};

