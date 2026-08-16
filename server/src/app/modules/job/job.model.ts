import { Schema, model } from 'mongoose';

import {
  DELIVERY_TYPE,
  JOB_ASSIGNMENT_TYPE,
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
      default: null,
      index: true,
    },
    requestedRider: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: 'User',
        },
      ],
      default: [],
      index: true,
    },
    assignedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
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
    deliveryType: {
      type: String,
      enum: Object.values(DELIVERY_TYPE),
      required: true,
      index: true,
    },
    pickup: { type: jobPointSchema, required: true },
    destination: { type: jobPointSchema, required: true },
    collectedMoney: { type: Number, default: 0, min: 0 },
    earning: { type: Number, default: 0, min: 0 },
    hasDeliveryOtpVerified: { type: Boolean, default: false },
    status: {
      type: String,
      enum: Object.values(JOB_STATUS),
      default: JOB_STATUS.assigned,
      index: true,
    },
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
jobSchema.index({ requestedRider: 1, status: 1 });

export const Job = model<IJob, IJobModel>('Job', jobSchema);


