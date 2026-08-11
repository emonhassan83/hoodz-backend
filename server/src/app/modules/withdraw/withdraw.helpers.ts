import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { USER_ROLE, USER_STATUS } from '@/app/modules/user/user.constant';
import { User } from '@/app/modules/user/user.model';
import { Withdraw } from '@/app/modules/withdraw/withdraw.model';

/** Throws when withdraw request does not exist. */
export const assertWithdrawExists = (withdraw: unknown, traceId: string) => {
  if (!withdraw) {
    throw new ApiError(HttpStatusCode.NotFound, 'Withdraw request not found', traceId);
  }
};

/** Returns an active rider for withdraw request creation. */
export const getActiveRiderOrThrow = async (traceId: string, riderId: string) => {
  const rider = await User.findOne({
    _id: riderId,
    role: USER_ROLE.rider,
    status: USER_STATUS.active,
    isDeleted: false,
  });
  if (!rider) {
    throw new ApiError(HttpStatusCode.Forbidden, 'Only active riders can request withdraw', traceId);
  }

  return rider;
};

/** Ensures rider has enough balance at request time. */
export const assertRiderBalanceEnough = (
  traceId: string,
  balance: number,
  amount: number
) => {
  if (balance < amount) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Insufficient wallet balance', traceId);
  }
};

/** Prevents too many unresolved withdraw requests for one rider. */
export const assertNoPendingWithdraw = async (traceId: string, riderId: string) => {
  const pending = await Withdraw.exists({
    author: riderId,
    status: 'pending',
    isDeleted: false,
  });
  if (pending) {
    throw new ApiError(
      HttpStatusCode.Conflict,
      'You already have a pending withdraw request',
      traceId
    );
  }
};
