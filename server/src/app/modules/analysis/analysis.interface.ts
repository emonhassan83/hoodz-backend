import { Model } from 'mongoose';

export interface IAnalysis {
  // define your types here
}

export type IAnalysisModel = Model<IAnalysis, Record<string, unknown>>;
