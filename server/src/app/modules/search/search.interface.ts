import { Model, Types } from 'mongoose';

import { SEARCH_TYPE } from '@/app/modules/search/search.constant';

export interface ISearch {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  modelType: SEARCH_TYPE;
  refId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type ISearchModel = Model<ISearch, Record<string, unknown>>;

