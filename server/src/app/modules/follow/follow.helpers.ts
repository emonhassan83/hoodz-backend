import { HttpStatusCode } from 'axios';
import { Types } from 'mongoose';

import ApiError from '@/app/errors/ApiError';
import { Follow } from '@/app/modules/follow/follow.model';
import { USER_ROLE, USER_STATUS } from '@/app/modules/user/user.constant';
import { User } from '@/app/modules/user/user.model';

/** Ensures the target vendor can be followed. */
export const assertFollowableVendor = async (
  traceId: string,
  vendorId: string
) => {
  const vendor = await User.findOne({
    _id: vendorId,
    role: USER_ROLE.vendor,
    status: USER_STATUS.active,
    isDeleted: false,
  }).select('_id');

  if (!vendor) {
    throw new ApiError(HttpStatusCode.NotFound, 'Vendor not found', traceId);
  }

  return vendor;
};

/** Returns the vendor ids followed by a user. */
export const getFollowedVendorIdSet = async (userId?: string) => {
  if (!userId) return new Set<string>();

  const follows = await Follow.find({ follower: userId })
    .select('following -_id')
    .lean();

  return new Set(
    follows.map((follow) => {
      const following = follow.following as { _id?: unknown } | string;
      if (following && typeof following === 'object' && '_id' in following) {
        return String(following._id);
      }
      return String(following);
    })
  );
};

/** Returns whether the user currently follows this vendor. */
export const isFollowingVendor = async (
  userId: string | undefined,
  vendorId: string
) => {
  if (!userId || !Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(vendorId)) {
    return false;
  }

  return Boolean(
    await Follow.exists({
      follower: new Types.ObjectId(userId),
      following: new Types.ObjectId(vendorId),
    })
  );
};

/** Adds isFollowing boolean to one vendor-like object. */
export const withFollowingFlag = <T extends { _id: unknown }>(
  vendor: T,
  followedVendorIds: Set<string>
) => ({
  ...vendor,
  isFollowing: followedVendorIds.has(String(vendor._id)),
});


