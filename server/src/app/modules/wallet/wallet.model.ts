import { Schema, model } from 'mongoose';

import {
  MOBILE_WALLET_PROVIDER,
  WALLET_ACCOUNT_TYPE,
  WALLET_OWNER_TYPE,
} from '@/app/modules/wallet/wallet.constant';
import {
  IWalletAccount,
  IWalletAccountModel,
} from '@/app/modules/wallet/wallet.interface';

const walletAccountSchema = new Schema<IWalletAccount, IWalletAccountModel>(
  {
    ownerType: {
      type: String,
      enum: Object.values(WALLET_OWNER_TYPE),
      required: true,
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      required(this: IWalletAccount) {
        return this.ownerType === WALLET_OWNER_TYPE.rider;
      },
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(WALLET_ACCOUNT_TYPE),
      required: true,
    },
    details: {
      walletProvider: {
        type: String,
        enum: Object.values(MOBILE_WALLET_PROVIDER),
        required(this: IWalletAccount) {
          return this.type === WALLET_ACCOUNT_TYPE.mobile_wallet;
        },
      },
      walletPhoneNumber: {
        type: String,
        trim: true,
        required(this: IWalletAccount) {
          return this.type === WALLET_ACCOUNT_TYPE.mobile_wallet;
        },
      },
      walletHolderName: {
        type: String,
        trim: true,
        required(this: IWalletAccount) {
          return this.type === WALLET_ACCOUNT_TYPE.mobile_wallet;
        },
      },
      instaPayAddress: {
        type: String,
        trim: true,
        required(this: IWalletAccount) {
          return this.type === WALLET_ACCOUNT_TYPE.instapay;
        },
      },
      accountHolderName: {
        type: String,
        trim: true,
        required(this: IWalletAccount) {
          return (
            this.type === WALLET_ACCOUNT_TYPE.instapay ||
            this.type === WALLET_ACCOUNT_TYPE.bank_account
          );
        },
      },
      registeredPhoneNumber: {
        type: String,
        trim: true,
        required(this: IWalletAccount) {
          return this.type === WALLET_ACCOUNT_TYPE.instapay;
        },
      },
      bankName: {
        type: String,
        trim: true,
        required(this: IWalletAccount) {
          return this.type === WALLET_ACCOUNT_TYPE.bank_account;
        },
      },
      accountNumber: {
        type: String,
        trim: true,
        required(this: IWalletAccount) {
          return this.type === WALLET_ACCOUNT_TYPE.bank_account;
        },
      },
      iban: {
        type: String,
        trim: true,
        required(this: IWalletAccount) {
          return this.type === WALLET_ACCOUNT_TYPE.bank_account;
        },
      },
      bankBranch: { type: String, trim: true, default: null },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

walletAccountSchema.index(
  { ownerType: 1, user: 1 },
  {
    unique: true,
    partialFilterExpression: { ownerType: WALLET_OWNER_TYPE.rider },
  }
);
walletAccountSchema.index(
  { ownerType: 1 },
  {
    unique: true,
    partialFilterExpression: { ownerType: WALLET_OWNER_TYPE.company },
  }
);

export const WalletAccount = model<IWalletAccount, IWalletAccountModel>(
  'WalletAccount',
  walletAccountSchema
);



