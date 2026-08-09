import { Model, Types } from 'mongoose';

import {
  MOBILE_WALLET_PROVIDER,
  WALLET_ACCOUNT_TYPE,
  WALLET_OWNER_TYPE,
} from '@/app/modules/wallet/wallet.constant';

export type TWalletOwnerType =
  (typeof WALLET_OWNER_TYPE)[keyof typeof WALLET_OWNER_TYPE];
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
  registeredPhoneNumber?: string;
  bankName?: string;
  accountNumber?: string;
  iban?: string;
  bankBranch?: string | null;
}

export interface IWalletAccount {
  _id: Types.ObjectId;
  ownerType: TWalletOwnerType;
  user?: Types.ObjectId | null;
  type: TWalletAccountType;
  details: IWalletAccountDetails;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type IWalletAccountModel = Model<IWalletAccount, Record<string, unknown>>;
