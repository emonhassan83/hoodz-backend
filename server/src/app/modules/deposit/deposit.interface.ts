import { Model, Types } from 'mongoose';

import { DEPOSIT_STATUS } from '@/app/modules/deposit/deposit.constant';

export type TDepositStatus =
  (typeof DEPOSIT_STATUS)[keyof typeof DEPOSIT_STATUS];

export interface IDeposit {
  _id: Types.ObjectId;
  id: string;
  rider: Types.ObjectId;
  job: Types.ObjectId;
  order: Types.ObjectId;
  vendor: Types.ObjectId;
  amount: number;
  reference: string;
  files: string[];
  status: TDepositStatus;
  verifiedBy?: Types.ObjectId | null;
  rejectionReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type IDepositModel = Model<IDeposit, Record<string, unknown>>;



