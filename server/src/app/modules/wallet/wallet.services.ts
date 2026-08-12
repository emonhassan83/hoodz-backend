import { findManageableWalletAccount } from '@/app/modules/wallet/wallet.helpers';
import { WalletAccount } from '@/app/modules/wallet/wallet.model';
import {
  TUpdateWalletAccountPayload,
  TWalletAccountPayload,
  TWalletRequester,
} from '@/app/modules/wallet/wallet.types';

/** Creates or replaces the rider payout wallet account. */
const addWallet = async (riderId: string, payload: TWalletAccountPayload) =>
  WalletAccount.findOneAndUpdate(
    { user: riderId },
    {
      user: riderId,
      type: payload.type,
      details: payload.details,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  ).select('-__v');

/** Returns the logged-in rider payout wallet account. */
const getMyWallet = async (riderId: string) =>
  WalletAccount.findOne({ user: riderId })
    .select('-__v')
    .lean();

/** Updates a wallet account after ownership/access verification. */
const updateWallet = async (
  traceId: string,
  requester: TWalletRequester,
  walletId: string,
  payload: TUpdateWalletAccountPayload
) => {
  const wallet = await findManageableWalletAccount(traceId, requester, walletId);

  if (payload.type !== undefined) wallet.type = payload.type as any;
  if (payload.details !== undefined) wallet.details = payload.details as any;

  await wallet.save();

  return WalletAccount.findById(wallet._id).select('-__v');
};

/** Removes a wallet account after ownership/access verification. */
const removeWallet = async (
  traceId: string,
  requester: TWalletRequester,
  walletId: string
) => {
  const wallet = await findManageableWalletAccount(traceId, requester, walletId);
  await wallet.deleteOne();

  return wallet;
};

export const WalletService = {
  addWallet,
  getMyWallet,
  updateWallet,
  removeWallet,
};
