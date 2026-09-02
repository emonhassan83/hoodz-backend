import { Schema, model } from 'mongoose';

import {
  ISavedLocation,
  ISavedLocationModel,
} from '@/app/modules/savedLocation/savedLocation.interface';

const savedLocationSchema = new Schema<ISavedLocation, ISavedLocationModel>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: { type: String, default: null, trim: true },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
      },
    },
    buildingNo: { type: Number, default: null },
    floorNo: { type: Number, default: null },
    apartment: { type: Number, default: null },
    city: { type: String, default: null, trim: true },
    country: { type: String, default: null, trim: true },
  },
  {
    timestamps: true,
  }
);

savedLocationSchema.index({ user: 1, createdAt: -1 });
savedLocationSchema.index({ location: '2dsphere' });

export const SavedLocation = model<ISavedLocation, ISavedLocationModel>(
  'SavedLocation',
  savedLocationSchema
);
