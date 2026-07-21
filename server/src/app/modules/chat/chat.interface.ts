import { Model, Types } from 'mongoose';

import { IChatStatus, IChatType } from './chat.constant';

export interface IChat {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  type: IChatType;
  order?: Types.ObjectId | null;
  participants: Types.ObjectId[];
  status: IChatStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type IChatModel = Model<IChat, Record<string, unknown>>;
