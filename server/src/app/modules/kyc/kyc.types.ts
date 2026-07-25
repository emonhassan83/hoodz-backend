import { KYC_STATUS, VEHICLE } from '@/app/modules/kyc/kyc.constant';

export type IVehicle = keyof typeof VEHICLE;
export type IKYCStatus = keyof typeof KYC_STATUS;

export type TAddKycPayload = {
  vehicle: string;
  license: string[];
  nationalId: string[];
};

export type TUpdateKycPayload = Partial<TAddKycPayload>;

export type TKycRequester = {
  userId: string;
  role: string;
};

export type TChangeKycStatusPayload = {
  status: string;
  rejectedReason?: string;
};

