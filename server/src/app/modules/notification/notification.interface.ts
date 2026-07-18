import { Document, Model, Types } from "mongoose";

import { INotificationModelType } from "@/app/modules/notification/notification.types";

export interface INotification extends Document {
  receiver: Types.ObjectId | string
  message: string
  description: string
  reference?: Types.ObjectId | string | null
  modelType: INotificationModelType
  date?: Date
  read?: boolean
}

export type ICommentsModules = Model<INotification, Record<string, unknown>>
