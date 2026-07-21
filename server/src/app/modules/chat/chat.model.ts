import { Schema, model } from 'mongoose';

import { CHAT_STATUS, CHAT_TYPES } from '@/app/modules/chat/chat.constant';
import { IChat, IChatModel } from '@/app/modules/chat/chat.interface';

const chatSchema = new Schema<IChat, IChatModel>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(CHAT_TYPES),
      required: true,
      index: true,
    },
    order: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
      index: true,
    },
    participants: {
      type: [Schema.Types.ObjectId],
      ref: 'User',
      required: true,
      default: [],
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(CHAT_STATUS),
      default: CHAT_STATUS.accepted,
    },
  },
  {
    timestamps: true,
  }
);

chatSchema.index(
  { user: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { type: CHAT_TYPES.customer_support },
  }
);
chatSchema.index(
  { user: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { type: CHAT_TYPES.ai_assistant },
  }
);
chatSchema.index(
  { order: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { type: CHAT_TYPES.order_support },
  }
);

export const Chat = model<IChat, IChatModel>('Chat', chatSchema);
