import { Schema, model } from 'mongoose';

import { KYC_STATUS, VEHICLE } from '@/app/modules/kyc/kyc.constant';
import { IKyc, IKycModel } from '@/app/modules/kyc/kyc.interface';

const kycSchema = new Schema<IKyc, IKycModel>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    vehicle: {
      type: String,
      enum: Object.values(VEHICLE),
      required: true,
    },
    license: {
      type: [String],
      required: true,
      default: [],
    },
    nationalId: {
      type: [String],
      required: true,
      default: [],
    },
    status: {
      type: String,
      enum: Object.values(KYC_STATUS),
      default: KYC_STATUS.pending,
      index: true,
    },
    rejectedReason: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Kyc = model<IKyc, IKycModel>('Kyc', kycSchema);
