import { Model, Types } from 'mongoose';

import { JOB_ASSIGNMENT_TYPE } from '@/app/constant';
import {
  DELIVERY_TYPE,
  JOB_DEPOSIT_STATUS,
  JOB_PAYMENT_METHOD,
  JOB_STATUS,
} from '@/app/modules/job/job.constant';

export type TJobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];
export type TJobAssignmentType =
  (typeof JOB_ASSIGNMENT_TYPE)[keyof typeof JOB_ASSIGNMENT_TYPE];
export type TJobPaymentMethod =
  (typeof JOB_PAYMENT_METHOD)[keyof typeof JOB_PAYMENT_METHOD];
export type TJobDeliveryType =
  (typeof DELIVERY_TYPE)[keyof typeof DELIVERY_TYPE];
export type TJobDepositStatus =
  (typeof JOB_DEPOSIT_STATUS)[keyof typeof JOB_DEPOSIT_STATUS];

export type TJobPoint = {
  address: string;
  coordinates: [number, number];
};

export interface IJob {
  _id: Types.ObjectId;
  id: string;
  order: Types.ObjectId;
  user?: Types.ObjectId | null;
  rider?: Types.ObjectId | null;
  requestedRider: Types.ObjectId[];
  declinedRider: Types.ObjectId[];
  offeredRider: Types.ObjectId[];
  assignedBy?: Types.ObjectId | null;
  assignmentType: TJobAssignmentType;
  paymentMethod: TJobPaymentMethod;
  deliveryType: TJobDeliveryType;
  pickup: TJobPoint;
  destination: TJobPoint;
  distance?: number | null;
  collectedMoney: number;
  earning: number;
  depositStatus: TJobDepositStatus;
  hasDeliveryOtpVerified: boolean;
  status: TJobStatus;
  matchAttemptCount: number;
  nextMatchAt?: Date | null;
  matchingEnabled: boolean;
  lastMatchedAt?: Date | null;
  acceptedAt?: Date | null;
  pickedUpAt?: Date | null;
  onTheWayAt?: Date | null;
  completedAt?: Date | null;
  deliveredLatitude?: number | null;
  deliveredLongitude?: number | null;
  vendorForgotReady?: boolean;
  cancelledAt?: Date | null;
  rejectionReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type IJobModel = Model<IJob, Record<string, unknown>>;


