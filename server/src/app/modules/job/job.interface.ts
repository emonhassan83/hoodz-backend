import { Model, Types } from 'mongoose';

import {
  JOB_ASSIGNMENT_TYPE,
  JOB_DEPOSIT_STATUS,
  JOB_PAYMENT_METHOD,
  JOB_STATUS,
} from '@/app/modules/job/job.constant';

export type TJobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];
export type TJobAssignmentType =
  (typeof JOB_ASSIGNMENT_TYPE)[keyof typeof JOB_ASSIGNMENT_TYPE];
export type TJobPaymentMethod =
  (typeof JOB_PAYMENT_METHOD)[keyof typeof JOB_PAYMENT_METHOD];
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
  rider: Types.ObjectId;
  vendor: Types.ObjectId;
  assignedBy: Types.ObjectId;
  assignmentType: TJobAssignmentType;
  paymentMethod: TJobPaymentMethod;
  pickup: TJobPoint;
  destination: TJobPoint;
  collectedMoney: number;
  earning: number;
  depositStatus: TJobDepositStatus;
  deliveryOtp?: string | null;
  deliveryOtpExpiresAt?: Date | null;
  depositReference?: string | null;
  depositedAt?: Date | null;
  status: TJobStatus;
  assignedAt: Date;
  acceptedAt?: Date | null;
  pickedUpAt?: Date | null;
  onTheWayAt?: Date | null;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
  rejectionReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type IJobModel = Model<IJob, Record<string, unknown>>;
