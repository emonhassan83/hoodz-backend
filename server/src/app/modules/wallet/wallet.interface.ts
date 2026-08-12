import { Model, Types } from 'mongoose';

import {
  MOBILE_WALLET_PROVIDER,
  WALLET_ACCOUNT_TYPE,
} from '@/app/modules/wallet/wallet.constant';

export type TWalletAccountType =
  (typeof WALLET_ACCOUNT_TYPE)[keyof typeof WALLET_ACCOUNT_TYPE];
export type TMobileWalletProvider =
  (typeof MOBILE_WALLET_PROVIDER)[keyof typeof MOBILE_WALLET_PROVIDER];

export interface IWalletAccountDetails {
  walletProvider?: TMobileWalletProvider;
  walletPhoneNumber?: string;
  walletHolderName?: string;
  instaPayAddress?: string;
  accountHolderName?: string;
}

export interface IWalletAccount {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  type: TWalletAccountType;
  details: IWalletAccountDetails;
  createdAt: Date;
  updatedAt: Date;
}

export type IWalletAccountModel = Model<IWalletAccount, Record<string, unknown>>;
