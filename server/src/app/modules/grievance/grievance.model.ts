import { Schema, model } from 'mongoose';

import {
  GRIEVANCE_RESOLUTION_TYPE,
  GRIEVANCE_STATUS,
} from '@/app/modules/grievance/grievance.constant';
import { IGrievance, IGrievanceModel } from '@/app/modules/grievance/grievance.interface';

const grievanceSchema = new Schema<IGrievance, IGrievanceModel>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    order: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    issueType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    files: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: Object.values(GRIEVANCE_STATUS),
      default: GRIEVANCE_STATUS.under_review,
      index: true,
    },
    resolutionType: {
      type: String,
      enum: Object.values(GRIEVANCE_RESOLUTION_TYPE),
      default: GRIEVANCE_RESOLUTION_TYPE.none,
      index: true,
    },
    note: {
      type: String,
      default: null,
      trim: true,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    rejectAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

grievanceSchema.index({ user: 1, createdAt: -1 });
grievanceSchema.index({ order: 1, status: 1 });

export const Grievance = model<IGrievance, IGrievanceModel>(
  'Grievance',
  grievanceSchema
);
