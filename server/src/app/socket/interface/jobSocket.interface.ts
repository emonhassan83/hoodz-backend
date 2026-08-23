export type TFindOnlineRiderSocketPayload = {
  orderId: string;
  radiusKm?: number;
};

export type TJobAssignSocketPayload = {
  orderId: string;
  riderId: string;
  assignmentType?: 'agent' | 'auto';
  paymentMethod?: 'card' | 'wallet' | 'cod';
};

export type TJobIdSocketPayload = {
  jobId: string;
};

export type TJobRejectSocketPayload = TJobIdSocketPayload & {
  reason?: string;
};

export type TRiderGoOnlineSocketPayload = {
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  heading?: number;
};

export type TRiderGoOfflineSocketPayload = {
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  heading?: number;
};

export type TRiderLocationUpdateSocketPayload = {
  jobId?: string;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  heading?: number;
  speed?: number;
  encodedRoute?: string;
};

export type TVerifyDeliveryOtpSocketPayload = {
  jobId: string;
  otp: string;
  verificationToken?: string;
};

export type TTrackOrderSocketPayload = {
  orderId: string;
};

export type TRideRatingSubmitSocketPayload = {
  jobId: string;
  rating: number;
  review: string;
  files?: string[];
};
