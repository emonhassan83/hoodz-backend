import { Model } from 'mongoose';

export interface IAnalysis {
  _id?: string;
}

export type IAnalysisModel = Model<IAnalysis, Record<string, unknown>>;
