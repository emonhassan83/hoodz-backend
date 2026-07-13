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
}

export type ISettingModules = Model<ISetting, Record<string, unknown>>;
