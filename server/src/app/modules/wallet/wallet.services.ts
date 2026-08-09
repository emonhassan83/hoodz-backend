import { WALLET_OWNER_TYPE } from '@/app/modules/wallet/wallet.constant';
import { findManageableWalletAccount } from '@/app/modules/wallet/wallet.helpers';
import { WalletAccount } from '@/app/modules/wallet/wallet.model';
import {
  TToggleWalletActivityPayload,
  TUpdateWalletAccountPayload,
  TWalletAccountPayload,
  TWalletRequester,
} from '@/app/modules/wallet/wallet.types';

/** Creates or replaces the rider payout wallet account. */
const addWallet = async (riderId: string, payload: TWalletAccountPayload) =>
  WalletAccount.findOneAndUpdate(
    { ownerType: WALLET_OWNER_TYPE.rider, user: riderId },
    {
      ownerType: WALLET_OWNER_TYPE.rider,
      user: riderId,
      type: payload.type,
      details: payload.details,
      isActive: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  ).select('-__v');

/** Returns the logged-in rider payout wallet account. */
const getMyWallet = async (riderId: string) =>
  WalletAccount.findOne({ ownerType: WALLET_OWNER_TYPE.rider, user: riderId })
    .select('-__v')
    .lean();

/** Returns the platform company receiving wallet account. */
const getCompanyWallet = async () =>
  WalletAccount.findOne({ ownerType: WALLET_OWNER_TYPE.company })
    .select('-__v')
    .lean();

/** Creates or replaces the platform company receiving wallet account. */
const setCompanyWallet = async (payload: TWalletAccountPayload) =>
  WalletAccount.findOneAndUpdate(
    { ownerType: WALLET_OWNER_TYPE.company },
    {
      ownerType: WALLET_OWNER_TYPE.company,
      user: null,
      type: payload.type,
      details: payload.details,
      isActive: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  ).select('-__v');

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
  if (payload.isActive !== undefined) wallet.isActive = payload.isActive;

  await wallet.save();

  return WalletAccount.findById(wallet._id).select('-__v');
};

/** Toggles or explicitly sets wallet account activity. */
const toggleActivity = async (
  traceId: string,
  requester: TWalletRequester,
  walletId: string,
  payload: TToggleWalletActivityPayload = {}
) => {
  const wallet = await findManageableWalletAccount(traceId, requester, walletId);
  wallet.isActive = payload.isActive ?? !wallet.isActive;
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
  getCompanyWallet,
  setCompanyWallet,
  updateWallet,
  toggleActivity,
  removeWallet,
};
