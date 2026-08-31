import { Schema, model } from 'mongoose';

import { generateCryptoString } from '@/app/utils/generateCryptoString';
import {
  IVendorTransction,
  IVendorTransctionModel,
} from '@/app/modules/vendorTransction/vendorTransction.interface';

const vendorTransctionSchema = new Schema<IVendorTransction, IVendorTransctionModel>(
  {
    id: {
      type: String,
      default: () => generateCryptoString(8),
      unique: true,
      index: true,
    },
    vendor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    note: {
      type: String,
      default: null,
      trim: true,
    },
    files: {
      type: [String],
      default: [],
    },
    paidBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

vendorTransctionSchema.index({ vendor: 1, createdAt: -1 });

export const VendorTransction = model<IVendorTransction, IVendorTransctionModel>(
  'VendorTransction',
  vendorTransctionSchema
);
