import { Model, Types } from 'mongoose';

export interface IMessages {
  _id: Types.ObjectId;
  text?: string;
  files?: string[];
  seen: boolean;
  isEdited: boolean;
  chat: Types.ObjectId;
  sender: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type IMessagesModel = Model<IMessages, Record<string, unknown>>;
