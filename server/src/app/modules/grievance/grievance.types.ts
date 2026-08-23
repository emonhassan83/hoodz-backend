import {
  GRIEVANCE_RESOLUTION_TYPE,
  GRIEVANCE_STATUS,
} from '@/app/modules/grievance/grievance.constant';

export type TGrievanceStatus =
  (typeof GRIEVANCE_STATUS)[keyof typeof GRIEVANCE_STATUS];

export type TGrievanceResolutionType =
  (typeof GRIEVANCE_RESOLUTION_TYPE)[keyof typeof GRIEVANCE_RESOLUTION_TYPE];

export type TCreateGrievancePayload = {
  order: string;
  issueType: string;
  description: string;
  files?: string[];
};

export type TResolveGrievancePayload = {
  status: TGrievanceStatus;
  resolutionType?: TGrievanceResolutionType;
  note?: string;
};

export type TGrievanceRequester = {
  userId: string;
  role: string;
};
