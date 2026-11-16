import { Schema, model } from 'mongoose';

import { JOB_ASSIGNMENT_TYPE } from '@/app/constant';
import {
  DELIVERY_TYPE,
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
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
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
    declinedRider: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: 'User',
        },
      ],
      default: [],
    },
    offeredRider: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: 'User',
        },
      ],
      default: [],
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
    distance: { type: Number, default: null, min: 0 },
    collectedMoney: { type: Number, default: 0, min: 0 },
    earning: { type: Number, default: 0, min: 0 },
    depositStatus: {
      type: String,
      enum: Object.values(JOB_DEPOSIT_STATUS),
      default: JOB_DEPOSIT_STATUS.not_required,
      index: true,
    },
    hasDeliveryOtpVerified: { type: Boolean, default: false },
    status: {
      type: String,
      enum: Object.values(JOB_STATUS),
      default: JOB_STATUS.matching,
      index: true,
    },
    matchAttemptCount: { type: Number, default: 0, min: 0 },
    nextMatchAt: { type: Date, default: null, index: true },
    matchingEnabled: { type: Boolean, default: true, index: true },
    lastMatchedAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
    pickedUpAt: { type: Date, default: null },
    onTheWayAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    deliveredLatitude: { type: Number, default: null },
    deliveredLongitude: { type: Number, default: null },
    vendorForgotReady: { type: Boolean, default: false },
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
jobSchema.index({ matchingEnabled: 1, rider: 1, status: 1, nextMatchAt: 1 });

export const Job = model<IJob, IJobModel>('Job', jobSchema);


