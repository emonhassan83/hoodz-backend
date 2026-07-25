import { Model, Types } from 'mongoose';

export type TMessageSenderType = 'user' | 'ai' | 'system';

export interface IMessages {
  _id: Types.ObjectId;
  text?: string;
  files?: string[];
  seen: boolean;
  isEdited: boolean;
  chat: Types.ObjectId;
  sender?: Types.ObjectId | null;
  senderType: TMessageSenderType;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export type IMessagesModel = Model<IMessages, Record<string, unknown>>;

