import { Model, Types } from 'mongoose';

import { IGeoLocation } from '@/app/modules/user/user.interface';

export interface ISavedLocation {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  name: string | null;
  location: IGeoLocation;
  buildingNo: number | null;
  floorNo: number | null;
  apartment: number | null;
  city: string | null;
  country: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ISavedLocationModel = Model<ISavedLocation, Record<string, unknown>>;
