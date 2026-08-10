import {
  GRIEVANCE_ISSUE_TYPE,
  GRIEVANCE_RESOLUTION_TYPE,
  GRIEVANCE_STATUS,
} from '@/app/modules/grievance/grievance.constant';

export type TGrievanceIssueType =
  (typeof GRIEVANCE_ISSUE_TYPE)[keyof typeof GRIEVANCE_ISSUE_TYPE];

export type TGrievanceStatus =
  (typeof GRIEVANCE_STATUS)[keyof typeof GRIEVANCE_STATUS];

export type TGrievanceResolutionType =
  (typeof GRIEVANCE_RESOLUTION_TYPE)[keyof typeof GRIEVANCE_RESOLUTION_TYPE];

export type TCreateGrievancePayload = {
  orderId: string;
  issueType: TGrievanceIssueType;
  description: string;
};

export type TResolveGrievancePayload = {
  status: TGrievanceStatus;
  resolutionType?: TGrievanceResolutionType;
  compensationVoucher?: string | null;
  refundAmount?: number;
  note?: string;
};

export type TGrievanceRequester = {
  userId: string;
  role: string;
};
