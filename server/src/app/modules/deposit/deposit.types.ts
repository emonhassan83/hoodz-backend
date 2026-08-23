import { TDepositStatus } from '@/app/modules/deposit/deposit.interface';

export type TSubmitDepositPayload = {
  jobIds: string[];
  fawryRefNo: string;
  receiptFiles: string[];
  note?: string;
};

export type TVerifyDepositPayload = {
  status: Extract<TDepositStatus, 'completed' | 'rejected'>;
  note?: string;
};

export type TDepositRequester = {
  userId: string;
  role: string;
};




