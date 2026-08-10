import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { USER_ROLE } from '@/app/modules/user/user.constant';

/** Checks if a requester can read a wallet transaction. */
export const assertWalletTransactionAccess = (
  traceId: string,
  transaction: { user: { toString: () => string } },
  requester: { userId: string; role: string }
) => {
  if (
    requester.role === USER_ROLE.admin ||
    transaction.user.toString() === requester.userId
  ) {
    return;
  }

  throw new ApiError(
    HttpStatusCode.Forbidden,
    'You are not allowed to view this wallet transaction',
    traceId
  );
};
