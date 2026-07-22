import { TCompanyDepositStatus } from '@/app/modules/companyDeposit/companyDeposit.interface';

export type TSubmitCompanyDepositPayload = {
  jobId: string;
  reference: string;
  files?: string[];
};

export type TVerifyCompanyDepositPayload = {
  status: Extract<TCompanyDepositStatus, 'verified' | 'rejected'>;
  reason?: string;
};

export type TCompanyDepositRequester = {
  userId: string;
  role: string;
};

