import { Schema, model } from 'mongoose';

import { SAVED_CARD_SETUP_STATUS } from '@/app/modules/savedCard/savedCard.constant';
import {
  ISavedCard,
  ISavedCardModel,
  ISavedCardSetupSession,
  ISavedCardSetupSessionModel,
} from '@/app/modules/savedCard/savedCard.interface';

const savedCardSchema = new Schema<ISavedCard, ISavedCardModel>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    paymobCardToken: { type: String, required: true, select: false },
    tokenHash: { type: String, required: true, index: true },
    maskedPan: { type: String, required: true, trim: true },
    last4: { type: String, required: true, trim: true },
    cardBrand: { type: String, required: true, trim: true },
    cardSubType: { type: String, default: null, trim: true },
    isDefault: { type: Boolean, default: false, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

savedCardSchema.index(
  { user: 1, tokenHash: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false },
  }
);
savedCardSchema.index({ user: 1, isDefault: 1, isDeleted: 1 });

const savedCardSetupSessionSchema = new Schema<
  ISavedCardSetupSession,
  ISavedCardSetupSessionModel
>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    paymobOrderId: { type: String, default: null, index: true },
    merchantOrderId: { type: String, required: true, unique: true, index: true },
    setDefault: { type: Boolean, default: false },
    status: {
      type: String,
      enum: Object.values(SAVED_CARD_SETUP_STATUS),
      default: SAVED_CARD_SETUP_STATUS.pending,
      index: true,
    },
    savedCard: { type: Schema.Types.ObjectId, ref: 'SavedCard', default: null },
    failureReason: { type: String, default: null, trim: true },
  },
  { timestamps: true }
);

savedCardSetupSessionSchema.index({ user: 1, status: 1, createdAt: -1 });

export const SavedCard = model<ISavedCard, ISavedCardModel>(
  'SavedCard',
  savedCardSchema
);

export const SavedCardSetupSession = model<
  ISavedCardSetupSession,
  ISavedCardSetupSessionModel
>('SavedCardSetupSession', savedCardSetupSessionSchema);
