import { Model, Types } from 'mongoose';

import { IParticipantStatus } from './participant.constant';

export interface IParticipant {
  _id: Types.ObjectId;
  chat: Types.ObjectId;
  user: Types.ObjectId;
  status: IParticipantStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type IParticipantModel = Model<IParticipant, Record<string, unknown>>;
