import { Schema, model } from 'mongoose';
import {
  GRIEVANCE_ISSUE_TYPE,
  GRIEVANCE_RESOLUTION_TYPE,
  GRIEVANCE_STATUS,
} from '@/app/modules/grievance/grievance.constant';
import { IGrievance, IGrievanceModel } from './grievance.interface';

const grievanceSchema = new Schema<IGrievance, IGrievanceModel>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    issueType: {
      type: String,
      enum: Object.values(GRIEVANCE_ISSUE_TYPE),
      required: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(GRIEVANCE_STATUS),
      default: GRIEVANCE_STATUS.submitted,
      index: true,
    },
    resolutionType: {
      type: String,
      enum: Object.values(GRIEVANCE_RESOLUTION_TYPE),
      default: GRIEVANCE_RESOLUTION_TYPE.none,
      index: true,
    },
    compensationVoucher: {
      type: Schema.Types.ObjectId,
      ref: 'Voucher',
      default: null,
    },
    refundAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    note: {
      type: String,
      default: null,
      trim: true,
    },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    isWalletRefundCredited: {
      type: Boolean,
      default: false,
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

grievanceSchema.index({ userId: 1, createdAt: -1 });
grievanceSchema.index({ orderId: 1, isDeleted: 1 });
grievanceSchema.index({ status: 1, isDeleted: 1 });

export const Grievance = model<IGrievance, IGrievanceModel>('Grievance', grievanceSchema);
