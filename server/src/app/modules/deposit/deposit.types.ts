import { TDepositStatus } from '@/app/modules/deposit/deposit.interface';

export type TSubmitDepositPayload = {
  jobId: string;
  reference: string;
  files?: string[];
};

export type TVerifyDepositPayload = {
  status: Extract<TDepositStatus, 'verified' | 'rejected'>;
  reason?: string;
};

export type TDepositRequester = {
  userId: string;
  role: string;
};



