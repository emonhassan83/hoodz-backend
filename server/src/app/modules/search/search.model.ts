import { Schema, model } from 'mongoose';

import { SEARCH_SOURCE } from '@/app/modules/search/search.constant';
import {
  ISearch,
  ISearchModel,
} from '@/app/modules/search/search.interface';

const searchSchema = new Schema<ISearch, ISearchModel>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    guestId: {
      type: String,
      trim: true,
      index: true,
    },
    query: {
      type: String,
      required: true,
      trim: true,
    },
    normalizedQuery: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    source: {
      type: String,
      enum: Object.values(SEARCH_SOURCE),
      default: SEARCH_SOURCE.manual,
    },
    resultCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastSearchedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

searchSchema.index(
  { userId: 1, normalizedQuery: 1 },
  { unique: true, partialFilterExpression: { userId: { $exists: true } } }
);
searchSchema.index(
  { guestId: 1, normalizedQuery: 1 },
  { unique: true, partialFilterExpression: { guestId: { $exists: true } } }
);
searchSchema.index({ userId: 1, lastSearchedAt: -1 });
searchSchema.index({ guestId: 1, lastSearchedAt: -1 });

export const Search = model<ISearch, ISearchModel>('Search', searchSchema);


