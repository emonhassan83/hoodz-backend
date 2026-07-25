import { Schema, model } from 'mongoose';

import { IFollow, IFollowModel } from '@/app/modules/follow/follow.interface';

const followSchema = new Schema<IFollow, IFollowModel>(
  {
    follower: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    following: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

followSchema.index({ follower: 1, following: 1 }, { unique: true });

export const Follow = model<IFollow, IFollowModel>('Follow', followSchema);

