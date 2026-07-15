import mongoose, { Schema } from "mongoose";

import { ISetting, ISettingModules } from "@/app/modules/settings/settings.interface";

const settingsSchema = new Schema<ISetting>({
  key: {
    type: String,
    required: [true, "Key is required"],
    trim: true,
  },
  value: {
    type: Schema.Types.Mixed,
    required: [true, "Value is required"],
  },
  name: {
    type: String,
    trim: true,
  },
  vendor: {
    type: Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
});

settingsSchema.index({ key: 1, vendor: 1 }, { unique: true });

export const Setting = mongoose.model<ISetting, ISettingModules>(
  "Setting",
  settingsSchema,
);
