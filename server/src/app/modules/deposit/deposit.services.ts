import { HttpStatusCode } from 'axios';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import { DEPOSIT_STATUS } from '@/app/modules/deposit/deposit.constant';
import {
  assertDepositAccess,
  depositListPopulate,
  depositPopulate,
  getDepositOrThrow,
  getDepositableJobsOrThrow,
  getRiderMoneySummary,
  mapDepositsToListCards,
  notifyAgentsDepositSubmitted,
  notifyRiderDepositVerified,
} from '@/app/modules/deposit/deposit.helpers';
import { JOB_DEPOSIT_STATUS } from '@/app/modules/job/job.constant';
import { Job } from '@/app/modules/job/job.model';
import { User } from '@/app/modules/user/user.model';
import { Deposit } from '@/app/modules/deposit/deposit.model';
import {
  TDepositRequester,
  TSubmitDepositPayload,
  TVerifyDepositPayload,
} from '@/app/modules/deposit/deposit.types';
/** Rider submits COD deposit proof. */
const submitDeposit = async (
  traceId: string,
  riderId: string,
  payload: TSubmitDepositPayload
) => {
  const jobs = await getDepositableJobsOrThrow(traceId, payload.jobIds, riderId);
  const calculatedAmount = Number(
    jobs.reduce((total, job) => total + (job.collectedMoney ?? 0), 0).toFixed(2)
  );
  if (calculatedAmount <= 0) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Selected jobs have no collected money to deposit',
      traceId
    );
  }

  const deposit = await Deposit.create({
    author: riderId,
    jobIds: jobs.map((job) => job._id),
    amount: calculatedAmount,
    fawryRefNo: payload.fawryRefNo,
    receiptFiles: payload.receiptFiles,
    status: DEPOSIT_STATUS.pending,
    note: payload.note ?? null,
  });

  await Job.updateMany(
    { _id: { $in: jobs.map((job) => job._id) } },
    { depositStatus: JOB_DEPOSIT_STATUS.submitted }
  );

  const created = await Deposit.findById(deposit._id).populate(depositPopulate);
  await notifyAgentsDepositSubmitted(created ?? deposit);
  return created;
};

/** Admin completes or rejects submitted COD deposit. */
const verifyDeposit = async (
  traceId: string,
  depositId: string,
  payload: TVerifyDepositPayload
) => {
  if (payload.status === DEPOSIT_STATUS.rejected && !payload.note) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Rejection note is required', traceId);
  }

  const deposit = await getDepositOrThrow(traceId, depositId);
  if (deposit.status !== DEPOSIT_STATUS.pending) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Only pending deposits can be verified', traceId);
  }
  deposit.status = payload.status;
  deposit.note = payload.note ?? deposit.note ?? null;
  await deposit.save();

  if (payload.status === DEPOSIT_STATUS.rejected) {
    await Job.updateMany(
      { _id: { $in: deposit.jobIds } },
      { depositStatus: JOB_DEPOSIT_STATUS.pending }
    );
  }

  if (payload.status === DEPOSIT_STATUS.completed) {
    const jobs = await Job.find({ _id: { $in: deposit.jobIds } }).select(
      'earning'
    );
    const earningCredit = Number(
      jobs.reduce((total, job) => total + (job.earning ?? 0), 0).toFixed(2)
    );
    await Job.updateMany(
      { _id: { $in: deposit.jobIds } },
      { depositStatus: JOB_DEPOSIT_STATUS.verified }
    );
    if (earningCredit > 0) {
      await User.findByIdAndUpdate(deposit.author, {
        $inc: { balance: earningCredit },
      });
    }
  }

  const verified = await Deposit.findById(deposit._id).populate(depositPopulate);
  await notifyRiderDepositVerified(verified ?? deposit);
  return verified;
};

/** Admin gets all deposits with pagination. */
const getAll = async (query: Record<string, unknown>) => {
  const depositQuery = new QueryBuilder(
    Deposit.find().populate(depositListPopulate).select('-__v').lean(),
    query
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const [deposits, meta] = await Promise.all([
    depositQuery.modelQuery,
    depositQuery.countTotal(),
  ]);

  return { meta, data: mapDepositsToListCards(deposits as any) };
};

/** Rider gets own deposits with pagination plus earning/collected summary. */
const getMyDeposits = async (riderId: string, query: Record<string, unknown>) => {
  const depositQuery = new QueryBuilder(
    Deposit.find({ author: riderId }).populate(depositListPopulate).select('-__v').lean(),
    query
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const [deposits, meta, summary] = await Promise.all([
    depositQuery.modelQuery,
    depositQuery.countTotal(),
    getRiderMoneySummary(riderId),
  ]);

  return {
    meta,
    data: {
      earning: summary.earning,
      balance: summary.balance,
      collectedMoney: summary.collectedMoney,
      deposits: mapDepositsToListCards(deposits as any),
    },
  };
};

/** Returns one deposit with role-based access. */
const getById = async (
  traceId: string,
  requester: TDepositRequester,
  depositId: string
) => {
  const deposit = await Deposit.findById(depositId)
    .populate(depositPopulate)
    .select('-__v')
    .lean();
  if (!deposit) {
    throw new ApiError(HttpStatusCode.NotFound, 'Deposit not found', traceId);
  }

  assertDepositAccess(traceId, deposit, requester);
  return deposit;
};

export const DepositService = {
  submitDeposit,
  verifyDeposit,
  getAll,
  getMy: getMyDeposits,
  getMyDeposits,
  getById,
};




