import { Schema, model } from 'mongoose';

import {
  ISupportAssignment,
  ISupportAssignmentModel,
} from '@/app/modules/supportAssignment/supportAssignment.interface';

const supportAssignmentSchema = new Schema<ISupportAssignment, ISupportAssignmentModel>(
  {
    customer: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    agent: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

supportAssignmentSchema.index({ agent: 1, customer: 1 });

export const SupportAssignment = model<ISupportAssignment, ISupportAssignmentModel>(
  'SupportAssignment',
  supportAssignmentSchema
);
