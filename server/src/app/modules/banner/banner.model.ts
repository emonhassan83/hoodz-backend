import { Schema, model } from 'mongoose';

import { IBanner, IBannerModel } from '@/app/modules/banner/banner.interface';

const bannerSchema = new Schema<IBanner, IBannerModel>(
  {
    banner: {
      type: String,
      required: true,
      trim: true,
    },
    reference: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

bannerSchema.index({ createdAt: -1 });

export const Banner = model<IBanner, IBannerModel>('Banner', bannerSchema);
