import { Model, Types } from 'mongoose';

import { COMPANY_DEPOSIT_STATUS } from '@/app/modules/companyDeposit/companyDeposit.constant';

export type TCompanyDepositStatus =
  (typeof COMPANY_DEPOSIT_STATUS)[keyof typeof COMPANY_DEPOSIT_STATUS];

export interface ICompanyDeposit {
  _id: Types.ObjectId;
  id: string;
  rider: Types.ObjectId;
  job: Types.ObjectId;
  order: Types.ObjectId;
  vendor: Types.ObjectId;
  amount: number;
  reference: string;
  files: string[];
  status: TCompanyDepositStatus;
  verifiedBy?: Types.ObjectId | null;
  rejectionReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ICompanyDepositModel = Model<ICompanyDeposit, Record<string, unknown>>;

