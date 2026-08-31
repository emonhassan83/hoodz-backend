import { Schema, model } from 'mongoose';

import { ICampain, ICampainModel } from '@/app/modules/campain/campain.interface';

const campainSchema = new Schema<ICampain, ICampainModel>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    banner: {
      type: Schema.Types.ObjectId,
      ref: 'Banner',
      required: true,
      unique: true,
      index: true,
    },
    products: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

campainSchema.index({ createdAt: -1 });

export const Campain = model<ICampain, ICampainModel>('Campain', campainSchema);
