import { Model, Types } from 'mongoose';

export interface ICategory {
  _id: Types.ObjectId;
  title: string;
  titleArabic?: string | null;
  icon: string;
}

export type ICategoryModel = Model<ICategory, Record<string, unknown>>;


