import { Model, Types } from 'mongoose';

import {
  TGrievanceIssueType,
  TGrievanceResolutionType,
  TGrievanceStatus,
} from '@/app/modules/grievance/grievance.types';

export interface IGrievance {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  orderId: Types.ObjectId;
  issueType: TGrievanceIssueType;
  description: string;
  status: TGrievanceStatus;
  resolutionType: TGrievanceResolutionType;
  compensationVoucher?: Types.ObjectId | null;
  refundAmount: number;
  note?: string | null;
  resolvedBy?: Types.ObjectId | null;
  resolvedAt?: Date | null;
  isWalletRefundCredited: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type IGrievanceModel = Model<IGrievance, Record<string, unknown>>;
