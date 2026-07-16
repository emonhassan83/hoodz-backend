import { Schema, model } from 'mongoose';

import { ICategory, ICategoryModel } from '@/app/modules/category/category.interface';

const categorySchema = new Schema<ICategory, ICategoryModel>(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      unique: true,
    },
    icon: {
      type: String,
      required: [true, 'Icon is required'],
      trim: true,
    },
  }
);

export const Category = model<ICategory, ICategoryModel>('Category', categorySchema);
