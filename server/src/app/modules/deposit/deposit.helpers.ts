import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { DEPOSIT_STATUS } from '@/app/modules/deposit/deposit.constant';
import { Deposit } from '@/app/modules/deposit/deposit.model';
import { JOB_DEPOSIT_STATUS, JOB_PAYMENT_METHOD, JOB_STATUS } from '@/app/modules/job/job.constant';
import { Job } from '@/app/modules/job/job.model';

/** Returns a COD delivered job for deposit submission or throws. */
export const getDepositableJobOrThrow = async (
  traceId: string,
  jobId: string,
  riderId: string
) => {
  const job = await Job.findById(jobId).select('+deliveryOtp');
  if (!job) {
    throw new ApiError(HttpStatusCode.NotFound, 'Job not found', traceId);
  }
  if (job.rider.toString() !== riderId) {
    throw new ApiError(HttpStatusCode.Forbidden, 'You can only deposit your own COD jobs', traceId);
  }
  if (job.status !== JOB_STATUS.delivered || job.paymentMethod !== JOB_PAYMENT_METHOD.cod) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Only delivered COD jobs require deposit', traceId);
  }
  if (job.depositStatus === JOB_DEPOSIT_STATUS.verified) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Deposit is already verified', traceId);
  }

  return job;
};

/** Returns one deposit document or throws. */
export const getDepositOrThrow = async (
  traceId: string,
  depositId: string
) => {
  const deposit = await Deposit.findById(depositId);
  if (!deposit) {
    throw new ApiError(HttpStatusCode.NotFound, 'Deposit not found', traceId);
  }
  return deposit;
};

/** Maps deposit status to job deposit status. */
export const resolveJobDepositStatus = (status: string) =>
  status === DEPOSIT_STATUS.verified
    ? JOB_DEPOSIT_STATUS.verified
    : JOB_DEPOSIT_STATUS.pending;




