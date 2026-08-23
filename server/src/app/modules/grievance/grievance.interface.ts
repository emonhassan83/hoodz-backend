import { Model, Types } from 'mongoose';

import {
  TGrievanceResolutionType,
  TGrievanceStatus,
} from '@/app/modules/grievance/grievance.types';

export interface IGrievance {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  order: Types.ObjectId;
  issueType: string;
  description: string;
  files: string[];
  status: TGrievanceStatus;
  resolutionType: TGrievanceResolutionType;
  note?: string | null;
  resolvedAt?: Date | null;
  rejectAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type IGrievanceModel = Model<IGrievance, Record<string, unknown>>;
