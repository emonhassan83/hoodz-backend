import { Schema, model } from 'mongoose';

import { PARTICIPANT_STATUS } from '@/app/modules/participant/participant.constant';
import {
  IParticipant,
  IParticipantModel,
} from '@/app/modules/participant/participant.interface';

const participantSchema = new Schema<IParticipant, IParticipantModel>(
  {
    chat: {
      type: Schema.Types.ObjectId,
      ref: 'Chat',
      required: true,
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(PARTICIPANT_STATUS),
      default: PARTICIPANT_STATUS.active,
    },
  },
  {
    timestamps: true,
  }
);

participantSchema.index({ chat: 1, user: 1 }, { unique: true });
participantSchema.index({ user: 1, status: 1, updatedAt: -1 });

export const Participant = model<IParticipant, IParticipantModel>(
  'Participant',
  participantSchema
);


