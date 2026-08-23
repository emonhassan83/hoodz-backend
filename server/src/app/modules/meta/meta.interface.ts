import { Model } from 'mongoose';

export interface IMeta {
  _id?: string;
}

export type IMetaModel = Model<IMeta, Record<string, unknown>>;
