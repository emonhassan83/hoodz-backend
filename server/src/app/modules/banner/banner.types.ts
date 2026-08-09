import {
  IBannerStatus,
  ISectionType,
} from '@/app/modules/banner/banner.interface';

export type TBannerPayload = {
  banner: string;
  reference?: string | null;
  section: ISectionType;
  status?: IBannerStatus;
};

export type TUpdateBannerPayload = Partial<{
  banner: string;
  reference: string | null;
  section: ISectionType;
  status: IBannerStatus;
}>;

export type TToggleBannerStatusPayload = {
  status?: IBannerStatus;
};

