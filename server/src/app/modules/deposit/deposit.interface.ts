import { Model, Types } from 'mongoose';

import { DEPOSIT_STATUS } from '@/app/modules/deposit/deposit.constant';

export type TDepositStatus =
  (typeof DEPOSIT_STATUS)[keyof typeof DEPOSIT_STATUS];

export interface IDeposit {
  _id: Types.ObjectId;
  id: string;
  author: Types.ObjectId;
  jobIds: Types.ObjectId[];
  amount: number;
  fawryRefNo: string;
  receiptFiles: string[];
  status: TDepositStatus;
  note?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type IDepositModel = Model<IDeposit, Record<string, unknown>>;




