export type TRiderWalletRequester = {
  userId: string;
  role: string;
};

export type TWithdrawRequestPayload = {
  amount: number;
  note?: string;
};

export type TRejectWithdrawPayload = {
  reason: string;
};

