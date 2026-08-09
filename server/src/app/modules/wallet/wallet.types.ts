import {
  IWalletAccountDetails,
  TWalletAccountType,
} from '@/app/modules/wallet/wallet.interface';

export type TWalletRequester = {
  userId: string;
  role: string;
};

export type TWalletAccountPayload = {
  type: TWalletAccountType;
  details: IWalletAccountDetails;
};

export type TUpdateWalletAccountPayload = Partial<TWalletAccountPayload> & {
  isActive?: boolean;
};

export type TToggleWalletActivityPayload = {
  isActive?: boolean;
};




