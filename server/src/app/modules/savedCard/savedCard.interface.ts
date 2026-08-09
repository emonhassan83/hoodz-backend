import { Model, Types } from 'mongoose';

import { SAVED_CARD_SETUP_STATUS } from '@/app/modules/savedCard/savedCard.constant';

export type TSavedCardSetupStatus =
  (typeof SAVED_CARD_SETUP_STATUS)[keyof typeof SAVED_CARD_SETUP_STATUS];

export interface ISavedCard {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  paymobCardToken: string;
  tokenHash: string;
  maskedPan: string;
  last4: string;
  cardBrand: string;
  cardSubType?: string | null;
  isDefault: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISavedCardSetupSession {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  paymobOrderId?: string | null;
  merchantOrderId: string;
  setDefault: boolean;
  status: TSavedCardSetupStatus;
  savedCard?: Types.ObjectId | null;
  failureReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ISavedCardModel = Model<ISavedCard, Record<string, unknown>>;
export type ISavedCardSetupSessionModel = Model<
  ISavedCardSetupSession,
  Record<string, unknown>
>;
