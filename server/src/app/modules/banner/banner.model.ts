import { Schema, model } from 'mongoose';

import {
  BANNER_STATUS,
  BANNER_TYPE,
  SECTION_TYPE,
} from '@/app/modules/banner/banner.constant';
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
      default: null,
      trim: true,
    },
    type: {
      type: String,
      enum: Object.values(BANNER_TYPE),
      default: BANNER_TYPE.product,
      index: true,
    },
    section: {
      type: String,
      enum: Object.values(SECTION_TYPE),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(BANNER_STATUS),
      default: BANNER_STATUS.active,
    },
  },
  { timestamps: true }
);

bannerSchema.index({ createdAt: -1 });
bannerSchema.index({ section: 1, status: 1 });

export const Banner = model<IBanner, IBannerModel>('Banner', bannerSchema);


