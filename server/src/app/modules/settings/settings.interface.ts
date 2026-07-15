import { Model, Types } from 'mongoose';

export interface IPlatformLocation {
  address?: string;
  latitude: number;
  longitude: number;
}

export interface ISetting {
  _id: Types.ObjectId;
  key: string;
  value: any;
  vendor?: Types.ObjectId | null;
  name?: string;
}

export type ISettingModules = Model<ISetting, Record<string, unknown>>;
