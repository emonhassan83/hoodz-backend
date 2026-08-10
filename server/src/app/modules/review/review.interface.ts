import { Model, Types } from 'mongoose';

import { TReviewModelType } from '@/app/modules/review/review.types';

export interface IReview {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  author: Types.ObjectId;
  modelType: TReviewModelType;
  reference: Types.ObjectId;
  review: string;
  files: string[];
  rating: number;
  createdAt: Date;
  updatedAt: Date;
}

export type IReviewModel = Model<IReview, Record<string, unknown>>;
