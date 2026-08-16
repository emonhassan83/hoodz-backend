import { Schema, model } from 'mongoose';
import { IAnalysis, IAnalysisModel } from './analysis.interface';

const analysisSchema = new Schema<IAnalysis, IAnalysisModel>(
  {
    // Define your schema properties here
  },
  {
    timestamps: true,
  }
);

export const Analysis = model<IAnalysis, IAnalysisModel>('Analysis', analysisSchema);
