import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { Deposit } from '@/app/modules/deposit/deposit.model';
import { JOB_PAYMENT_METHOD, JOB_STATUS } from '@/app/modules/job/job.constant';
import { Job } from '@/app/modules/job/job.model';

/** Returns COD delivered jobs for deposit submission or throws. */
export const getDepositableJobsOrThrow = async (
  traceId: string,
  jobIds: string[],
  riderId: string
) => {
  const uniqueJobIds = [...new Set(jobIds)];
  if (uniqueJobIds.length !== jobIds.length) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Duplicate job ids are not allowed', traceId);
  }

  const jobs = await Job.find({ _id: { $in: uniqueJobIds } });
  if (jobs.length !== uniqueJobIds.length) {
    throw new ApiError(HttpStatusCode.NotFound, 'One or more jobs were not found', traceId);
  }

  jobs.forEach((job) => {
    if (job.rider.toString() !== riderId) {
      throw new ApiError(HttpStatusCode.Forbidden, 'You can only deposit your own COD jobs', traceId);
    }
    if (job.status !== JOB_STATUS.delivered || job.paymentMethod !== JOB_PAYMENT_METHOD.cod) {
      throw new ApiError(HttpStatusCode.BadRequest, 'Only delivered COD jobs require deposit', traceId);
    }
  });

  const existingDeposit = await Deposit.findOne({
    jobIds: { $in: uniqueJobIds },
    status: { $ne: 'rejected' },
  });
  if (existingDeposit) {
    throw new ApiError(
      HttpStatusCode.Conflict,
      'One or more jobs already have a pending or completed deposit',
      traceId
    );
  }

  return jobs;
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


