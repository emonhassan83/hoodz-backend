import { HttpStatusCode } from 'axios';
import mongoose from 'mongoose';

import { RIDER_CASH_IN_HAND_LIMIT_EGP } from '@/app/constant';
import ApiError from '@/app/errors/ApiError';
import {
  JOB_DEPOSIT_STATUS,
  JOB_PAYMENT_METHOD,
  JOB_STATUS,
} from '@/app/modules/job/job.constant';
import { Job } from '@/app/modules/job/job.model';

/** Cash the rider still owes from delivered COD jobs. */
export const getRiderCashInHand = async (riderId: string) => {
  if (!mongoose.Types.ObjectId.isValid(riderId)) return 0;

  const [row] = await Job.aggregate<{ total?: number }>([
    {
      $match: {
        rider: new mongoose.Types.ObjectId(riderId),
        paymentMethod: JOB_PAYMENT_METHOD.cod,
        depositStatus: {
          $in: [JOB_DEPOSIT_STATUS.pending, JOB_DEPOSIT_STATUS.submitted],
        },
        status: JOB_STATUS.delivered,
      },
    },
    { $group: { _id: null, total: { $sum: '$collectedMoney' } } },
  ]);

  return Number(row?.total ?? 0);
};

/** Blocks new jobs until an approved deposit brings cash-in-hand under the limit. */
export const assertRiderCashInHandAllowsJobs = async (
  traceId: string,
  riderId: string
) => {
  const cashInHand = await getRiderCashInHand(riderId);
  if (cashInHand < RIDER_CASH_IN_HAND_LIMIT_EGP) return cashInHand;

  throw new ApiError(
    HttpStatusCode.BadRequest,
    `Cash in hand is ${cashInHand.toFixed(2)} EGP. Deposit it before taking new jobs.`,
    traceId
  );
};
