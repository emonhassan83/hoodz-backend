import { HttpStatusCode } from 'axios';
import { Types } from 'mongoose';

import ApiError from '@/app/errors/ApiError';
import { WalletAccount } from '@/app/modules/wallet/wallet.model';
import { TWalletRequester } from '@/app/modules/wallet/wallet.types';

/** Throws when a wallet account was not found. */
export const assertWalletAccountExists = (
  wallet: unknown,
  traceId: string
) => {
  if (!wallet) {
    throw new ApiError(
      HttpStatusCode.NotFound,
      'Wallet account not found',
      traceId
    );
  }
};

/** Checks whether requester can mutate the selected wallet account. */
export const assertCanManageWalletAccount = (
  wallet: {
    user: Types.ObjectId | string;
  },
  requester: TWalletRequester,
  traceId: string
) => {
  if (wallet.user.toString() !== requester.userId) {
    throw new ApiError(
      HttpStatusCode.Forbidden,
      'You are not allowed to manage this wallet account',
      traceId
    );
  }
};

/** Finds one wallet account by id and verifies mutate access. */
export const findManageableWalletAccount = async (
  traceId: string,
  requester: TWalletRequester,
  walletId: string
) => {
  const wallet = await WalletAccount.findById(walletId);
  assertWalletAccountExists(wallet, traceId);
  assertCanManageWalletAccount(wallet!, requester, traceId);

  return wallet!;
};
