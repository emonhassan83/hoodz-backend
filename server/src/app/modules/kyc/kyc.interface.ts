import { Model, Types } from 'mongoose';

import { IKYCStatus, IVehicle } from '@/app/modules/kyc/kyc.types';

export interface IKyc {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  vehicle: IVehicle;
  license: string[];
  nationalId: string[];
  status: IKYCStatus;
  rejectedReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type IKycModel = Model<IKyc, Record<string, unknown>>;
