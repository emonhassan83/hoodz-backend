import { Model } from 'mongoose';

export interface IMeta {
  // define your types here
}

export type IMetaModel = Model<IMeta, Record<string, unknown>>;
