import { Schema, model } from 'mongoose';

import {
  MOBILE_WALLET_PROVIDER,
  WALLET_ACCOUNT_TYPE,
} from '@/app/modules/wallet/wallet.constant';
import {
  IWalletAccount,
  IWalletAccountModel,
} from '@/app/modules/wallet/wallet.interface';

const walletAccountSchema = new Schema<IWalletAccount, IWalletAccountModel>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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
          return this.type === WALLET_ACCOUNT_TYPE.instapay;
        },
      },
    },
  },
  { timestamps: true }
);

walletAccountSchema.index(
  { user: 1 },
  { unique: true }
);

export const WalletAccount = model<IWalletAccount, IWalletAccountModel>(
  'WalletAccount',
  walletAccountSchema
);



