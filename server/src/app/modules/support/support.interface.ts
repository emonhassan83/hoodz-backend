import { Model } from 'mongoose';

export interface ISupport {
  // define your types here
  subject: string
  messages: string
}

export type ISupportModel = Model<ISupport, Record<string, unknown>>;
