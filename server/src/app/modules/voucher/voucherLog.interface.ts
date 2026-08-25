import { Model, Types } from 'mongoose';

export interface IVoucherLog {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  voucher: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type IVoucherLogModel = Model<IVoucherLog, Record<string, unknown>>;
