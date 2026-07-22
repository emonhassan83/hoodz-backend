import { Schema, model } from 'mongoose';

import { COMPANY_DEPOSIT_STATUS } from '@/app/modules/companyDeposit/companyDeposit.constant';
import {
  ICompanyDeposit,
  ICompanyDepositModel,
} from '@/app/modules/companyDeposit/companyDeposit.interface';
import { generateCryptoString } from '@/app/utils/generateCryptoString';

const companyDepositSchema = new Schema<ICompanyDeposit, ICompanyDepositModel>(
  {
    id: {
      type: String,
      default: () => generateCryptoString(10),
      unique: true,
      index: true,
    },
    rider: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    job: {
      type: Schema.Types.ObjectId,
      ref: 'Job',
      required: true,
      unique: true,
      index: true,
    },
    order: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    vendor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    reference: { type: String, required: true, trim: true },
    files: { type: [String], default: [] },
    status: {
      type: String,
      enum: Object.values(COMPANY_DEPOSIT_STATUS),
      default: COMPANY_DEPOSIT_STATUS.submitted,
      index: true,
    },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    rejectionReason: { type: String, default: null, trim: true },
  },
  { timestamps: true }
);

companyDepositSchema.index({ rider: 1, status: 1, createdAt: -1 });
companyDepositSchema.index({ vendor: 1, status: 1, createdAt: -1 });

export const CompanyDeposit = model<ICompanyDeposit, ICompanyDepositModel>(
  'CompanyDeposit',
  companyDepositSchema
);

