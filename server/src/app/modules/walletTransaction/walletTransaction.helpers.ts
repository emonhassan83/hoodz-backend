import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { USER_ROLE } from '@/app/modules/user/user.constant';

/** Resolves owner id from populated or raw user reference. */
export const getWalletTransactionUserId = (user: unknown) => {
  if (!user || typeof user !== 'object') {
    return String(user ?? '');
  }

  const record = user as { _id?: { toString: () => string }; toString?: () => string };
  return record._id?.toString?.() ?? record.toString?.() ?? '';
};

/** Checks if a requester can read a wallet transaction. */
export const assertWalletTransactionAccess = (
  traceId: string,
  transaction: { user: unknown },
  requester: { userId: string; role: string }
) => {
  if (
    requester.role === USER_ROLE.admin ||
    getWalletTransactionUserId(transaction.user) === requester.userId
  ) {
    return;
  }

  throw new ApiError(
    HttpStatusCode.Forbidden,
    'You are not allowed to view this wallet transaction',
    traceId
  );
};
