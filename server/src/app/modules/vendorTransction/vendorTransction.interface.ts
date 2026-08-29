import { Model, Types } from 'mongoose';

export interface IVendorTransction {
  id: string;
  vendor: Types.ObjectId;
  amount: number;
  note?: string | null;
  paidBy?: Types.ObjectId | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type IVendorTransctionModel = Model<
  IVendorTransction,
  Record<string, unknown>
>;
