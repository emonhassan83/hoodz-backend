import { Schema, model } from 'mongoose';
import { IMeta, IMetaModel } from './meta.interface';

const metaSchema = new Schema<IMeta, IMetaModel>(
  {
    // Define your schema properties here
  },
  {
    timestamps: true,
  }
);

export const Meta = model<IMeta, IMetaModel>('Meta', metaSchema);
