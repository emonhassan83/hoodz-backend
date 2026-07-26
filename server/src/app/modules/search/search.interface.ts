import { Model, Types } from 'mongoose';

import { SEARCH_SOURCE } from '@/app/modules/search/search.constant';

export interface ISearch {
  _id: Types.ObjectId;
  userId?: Types.ObjectId;
  guestId?: string;
  query: string;
  normalizedQuery: string;
  source: SEARCH_SOURCE;
  resultCount: number;
  lastSearchedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type ISearchModel = Model<ISearch, Record<string, unknown>>;

