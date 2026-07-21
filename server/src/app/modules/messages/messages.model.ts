import { Schema, model } from 'mongoose';

import {
  IMessages,
  IMessagesModel,
} from '@/app/modules/messages/messages.interface';

const messagesSchema = new Schema<IMessages, IMessagesModel>(
  {
    text: {
      type: String,
      trim: true,
      default: null,
    },
    files: {
      type: [String],
      default: [],
    },
    seen: {
      type: Boolean,
      default: false,
      index: true,
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    chat: {
      type: Schema.Types.ObjectId,
      ref: 'Chat',
      required: true,
      index: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

messagesSchema.index({ chat: 1, createdAt: -1 });

export const Messages = model<IMessages, IMessagesModel>(
  'Messages',
  messagesSchema
);
