import {
  WALLET_TRANSACTION_DIRECTION,
  WALLET_TRANSACTION_REFERENCE_TYPE,
  WALLET_TRANSACTION_STATUS,
  WALLET_TRANSACTION_TYPE,
} from '@/app/modules/walletTransaction/walletTransaction.constant';

export type TWalletTransactionType =
  (typeof WALLET_TRANSACTION_TYPE)[keyof typeof WALLET_TRANSACTION_TYPE];

export type TWalletTransactionDirection =
  (typeof WALLET_TRANSACTION_DIRECTION)[keyof typeof WALLET_TRANSACTION_DIRECTION];

export type TWalletTransactionStatus =
  (typeof WALLET_TRANSACTION_STATUS)[keyof typeof WALLET_TRANSACTION_STATUS];

export type TWalletTransactionReferenceType =
  (typeof WALLET_TRANSACTION_REFERENCE_TYPE)[keyof typeof WALLET_TRANSACTION_REFERENCE_TYPE];

export type TWalletTransactionRequester = {
  userId: string;
  role: string;
};

export type TCreateWalletTransactionPayload = {
  user: string;
  type: TWalletTransactionType;
  amount: number;
  direction: TWalletTransactionDirection;
  status?: TWalletTransactionStatus;
  referenceType?: TWalletTransactionReferenceType;
  reference?: string | null;
  savedCard?: string | null;
  paymobTransactionId?: string | null;
  note?: string | null;
};

export type TRefundToCardPayload = {
  savedCardId: string;
  amount: number;
};
