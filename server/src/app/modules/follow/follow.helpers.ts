import { HttpStatusCode } from 'axios';

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

  return new Set(follows.map((follow) => follow.following.toString()));
};

/** Adds isFollowing boolean to one vendor-like object. */
export const withFollowingFlag = <T extends { _id: unknown }>(
  vendor: T,
  followedVendorIds: Set<string>
) => ({
  ...vendor,
  isFollowing: followedVendorIds.has(String(vendor._id)),
});

