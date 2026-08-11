import { WITHDRAW_STATUS } from '@/app/modules/withdraw/withdraw.constant';

export type TWithdrawStatus =
  (typeof WITHDRAW_STATUS)[keyof typeof WITHDRAW_STATUS];

export type TAddWithdrawPayload = {
  amount: number;
  note?: string;
};

export type TChangeWithdrawStatusPayload = {
  status: TWithdrawStatus;
  note?: string;
};

export type TWithdrawRequester = {
  userId: string;
  role: string;
};
