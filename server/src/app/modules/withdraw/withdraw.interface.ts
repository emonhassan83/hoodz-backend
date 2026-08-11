import { Model, Types } from 'mongoose';

import { TWithdrawStatus } from '@/app/modules/withdraw/withdraw.types';

export interface IWithdraw {
  _id: Types.ObjectId;
  id: string;
  author: Types.ObjectId;
  amount: number;
  status: TWithdrawStatus;
  note?: string | null;
  completedAt?: Date | null;
  rejectedAt?: Date | null;
  processedBy?: Types.ObjectId | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type IWithdrawModel = Model<IWithdraw, Record<string, unknown>>;
