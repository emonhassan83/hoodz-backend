import {
  IBannerStatus,
  IBannerType,
  ISectionType,
} from '@/app/modules/banner/banner.interface';

export type TBannerPayload = {
  banner: string;
  reference?: string | null;
  type?: IBannerType;
  section: ISectionType;
  status?: IBannerStatus;
};

export type TUpdateBannerPayload = Partial<{
  banner: string;
  reference: string | null;
  type: IBannerType;
  section: ISectionType;
  status: IBannerStatus;
}>;

export type TToggleBannerStatusPayload = {
  status?: IBannerStatus;
};


