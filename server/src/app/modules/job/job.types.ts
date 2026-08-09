import { TJobAssignmentType, TJobPaymentMethod } from '@/app/modules/job/job.interface';

export type TJobRequester = {
  userId: string;
  role: string;
};

export type TGeoPayload = {
  latitude: number;
  longitude: number;
  heading?: number;
};

export type TFindOnlineRiderPayload = TGeoPayload & {
  orderId: string;
  radiusKm?: number;
};

export type TAssignJobPayload = {
  orderId: string;
  riderId: string;
  assignmentType?: TJobAssignmentType;
  paymentMethod?: TJobPaymentMethod;
};

export type TJobIdPayload = {
  jobId: string;
};

export type TRejectJobPayload = TJobIdPayload & {
  reason?: string;
};

export type TVerifyDeliveryOtpPayload = TJobIdPayload & {
  otp: string;
};



