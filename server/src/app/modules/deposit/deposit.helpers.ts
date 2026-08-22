import { HttpStatusCode } from 'axios';
import mongoose from 'mongoose';

import ApiError from '@/app/errors/ApiError';
import { Deposit } from '@/app/modules/deposit/deposit.model';
import {
  JOB_DEPOSIT_STATUS,
  JOB_PAYMENT_METHOD,
  JOB_STATUS,
} from '@/app/modules/job/job.constant';
import { Job } from '@/app/modules/job/job.model';
import { User } from '@/app/modules/user/user.model';

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
    if (!job.rider || job.rider.toString() !== riderId) {
      throw new ApiError(HttpStatusCode.Forbidden, 'You can only deposit your own COD jobs', traceId);
    }
    if (job.status !== JOB_STATUS.delivered || job.paymentMethod !== JOB_PAYMENT_METHOD.cod) {
      throw new ApiError(HttpStatusCode.BadRequest, 'Only delivered COD jobs require deposit', traceId);
    }
    if (
      job.depositStatus &&
      job.depositStatus !== JOB_DEPOSIT_STATUS.pending &&
      job.depositStatus !== JOB_DEPOSIT_STATUS.not_required
    ) {
      throw new ApiError(
        HttpStatusCode.BadRequest,
        'This COD job is already submitted or deposited',
        traceId
      );
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

/** Rider profile earning plus undeposited COD collected cash. */
export const getRiderMoneySummary = async (riderId: string) => {
  const [rider, collected] = await Promise.all([
    User.findById(riderId).select('balance').lean(),
    Job.aggregate<{ total: number }>([
      {
        $match: {
          rider: new mongoose.Types.ObjectId(riderId),
          paymentMethod: JOB_PAYMENT_METHOD.cod,
          status: JOB_STATUS.delivered,
          depositStatus: {
            $nin: [JOB_DEPOSIT_STATUS.verified],
          },
        },
      },
      { $group: { _id: null, total: { $sum: '$collectedMoney' } } },
    ]),
  ]);

  return {
    earning: Number((rider?.balance ?? 0).toFixed(2)),
    collectedMoney: Number((collected[0]?.total ?? 0).toFixed(2)),
  };
};


