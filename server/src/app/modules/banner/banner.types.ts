import {
  IBannerStatus,
  IBannerType,
  ISectionType,
} from '@/app/modules/banner/banner.interface';

export type TBannerPayload = {
  banner: string;
  bannerArabic?: string | null;
  reference?: string | null;
  type?: IBannerType;
  section: ISectionType;
  status?: IBannerStatus;
};

export type TUpdateBannerPayload = Partial<{
  banner: string;
  bannerArabic: string | null;
  reference: string | null;
  type: IBannerType;
  section: ISectionType;
  status: IBannerStatus;
}>;

export type TToggleBannerStatusPayload = {
  status?: IBannerStatus;
};


