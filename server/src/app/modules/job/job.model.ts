import { Schema, model } from 'mongoose';

import {
  JOB_ASSIGNMENT_TYPE,
  JOB_DEPOSIT_STATUS,
  JOB_PAYMENT_METHOD,
  JOB_STATUS,
} from '@/app/modules/job/job.constant';
import { IJob, IJobModel } from '@/app/modules/job/job.interface';
import { generateCryptoString } from '@/app/utils/generateCryptoString';

const jobPointSchema = new Schema(
  {
    address: { type: String, required: true, trim: true },
    coordinates: { type: [Number], required: true },
  },
  { _id: false }
);

const jobSchema = new Schema<IJob, IJobModel>(
  {
    id: {
      type: String,
      default: () => generateCryptoString(10),
      unique: true,
      index: true,
    },
    order: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    rider: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    vendor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    assignedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    assignmentType: {
      type: String,
      enum: Object.values(JOB_ASSIGNMENT_TYPE),
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: Object.values(JOB_PAYMENT_METHOD),
      required: true,
      index: true,
    },
    pickup: { type: jobPointSchema, required: true },
    destination: { type: jobPointSchema, required: true },
    collectedMoney: { type: Number, default: 0, min: 0 },
    earning: { type: Number, default: 0, min: 0 },
    depositStatus: {
      type: String,
      enum: Object.values(JOB_DEPOSIT_STATUS),
      default: JOB_DEPOSIT_STATUS.not_required,
      index: true,
    },
    deliveryOtp: { type: String, default: null, select: false },
    deliveryOtpExpiresAt: { type: Date, default: null },
    depositReference: { type: String, default: null, trim: true },
    depositedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: Object.values(JOB_STATUS),
      default: JOB_STATUS.assigned,
      index: true,
    },
    assignedAt: { type: Date, default: Date.now },
    acceptedAt: { type: Date, default: null },
    pickedUpAt: { type: Date, default: null },
    onTheWayAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null, trim: true },
  },
  {
    timestamps: true,
  }
);

jobSchema.index({ order: 1, status: 1 });
jobSchema.index({ rider: 1, status: 1, createdAt: -1 });
jobSchema.index({ vendor: 1, status: 1, createdAt: -1 });

export const Job = model<IJob, IJobModel>('Job', jobSchema);

