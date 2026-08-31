import { Document, Model, Types } from 'mongoose';

export interface ISupportAssignment extends Document {
  _id: Types.ObjectId;
  customer: Types.ObjectId;
  agent: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ISupportAssignmentModel = Model<ISupportAssignment>;
