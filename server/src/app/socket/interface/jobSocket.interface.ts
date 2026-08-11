export type TFindOnlineRiderSocketPayload = {
  orderId: string;
  latitude: number;
  longitude: number;
  radiusKm?: number;
};

export type TJobAssignSocketPayload = {
  orderId: string;
  riderId: string;
  assignmentType?: 'vendor' | 'admin' | 'auto';
  paymentMethod?: 'card' | 'wallet' | 'cod';
};

export type TJobIdSocketPayload = {
  jobId: string;
};

export type TJobRejectSocketPayload = TJobIdSocketPayload & {
  reason?: string;
};

export type TRiderGoOnlineSocketPayload = {
  latitude: number;
  longitude: number;
  heading?: number;
};

export type TRiderLocationUpdateSocketPayload = TJobIdSocketPayload & {
  latitude: number;
  longitude: number;
  heading?: number;
};

export type TVerifyDeliveryOtpSocketPayload = TJobIdSocketPayload & {
  otp: string;
};
