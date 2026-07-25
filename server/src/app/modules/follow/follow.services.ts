import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { assertFollowableVendor } from '@/app/modules/follow/follow.helpers';
import { Follow } from '@/app/modules/follow/follow.model';
import { User } from '@/app/modules/user/user.model';

/** Follows a vendor and increments vendor follower count once. */
const follow = async (traceId: string, followerId: string, vendorId: string) => {
  if (followerId === vendorId) {
    throw new ApiError(HttpStatusCode.BadRequest, 'You cannot follow yourself', traceId);
  }

  await assertFollowableVendor(traceId, vendorId);

  const result = await Follow.updateOne(
    { follower: followerId, following: vendorId },
    { follower: followerId, following: vendorId },
    { upsert: true }
  );

  if (result.upsertedCount > 0) {
    await User.findByIdAndUpdate(vendorId, { $inc: { followers: 1 } });
  }

  return { following: vendorId, isFollowing: true };
};

/** Unfollows a vendor and decrements vendor follower count safely. */
const unfollow = async (
  traceId: string,
  followerId: string,
  vendorId: string
) => {
  await assertFollowableVendor(traceId, vendorId);

  const result = await Follow.deleteOne({
    follower: followerId,
    following: vendorId,
  });

  if (result.deletedCount > 0) {
    await User.findByIdAndUpdate(vendorId, {
      $inc: { followers: -1 },
    });
    await User.updateOne(
      { _id: vendorId, followers: { $lt: 0 } },
      { followers: 0 }
    );
  }

  return { following: vendorId, isFollowing: false };
};

export const FollowService = {
  follow,
  unfollow,
};

