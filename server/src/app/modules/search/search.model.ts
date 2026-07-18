import { Schema, model } from 'mongoose';

import { SEARCH_TYPE } from '@/app/modules/search/search.constant';
import {
  ISearch,
  ISearchModel,
} from '@/app/modules/search/search.interface';

const searchSchema = new Schema<ISearch, ISearchModel>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    modelType: {
      type: String,
      enum: Object.values(SEARCH_TYPE),
      required: true,
    },
    refId: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: 'modelType',
    },
  },
  { timestamps: true }
);

searchSchema.index({ userId: 1, modelType: 1, refId: 1 }, { unique: true });
searchSchema.index({ userId: 1, updatedAt: -1 });

export const Search = model<ISearch, ISearchModel>('Search', searchSchema);
