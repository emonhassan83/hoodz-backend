import { Model, Types } from 'mongoose';

import {
  BANNER_STATUS,
  BANNER_TYPE,
  SECTION_TYPE,
} from '@/app/modules/banner/banner.constant';

export type ISectionType = (typeof SECTION_TYPE)[keyof typeof SECTION_TYPE];
export type IBannerType = (typeof BANNER_TYPE)[keyof typeof BANNER_TYPE];
export type IBannerStatus = (typeof BANNER_STATUS)[keyof typeof BANNER_STATUS];

export interface IBanner {
  _id: Types.ObjectId;
  banner: string;
  bannerArabic?: string | null;
  reference: string | null;
  type: IBannerType;
  section: ISectionType;
  status: IBannerStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type IBannerModel = Model<IBanner, Record<string, unknown>>;

