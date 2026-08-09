import { HttpStatusCode } from 'axios';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import { DEPOSIT_STATUS } from '@/app/modules/deposit/deposit.constant';
import {
  getDepositOrThrow,
  getDepositableJobOrThrow,
  resolveJobDepositStatus,
} from '@/app/modules/deposit/deposit.helpers';
import { Deposit } from '@/app/modules/deposit/deposit.model';
import {
  TDepositRequester,
  TSubmitDepositPayload,
  TVerifyDepositPayload,
} from '@/app/modules/deposit/deposit.types';
import { JOB_DEPOSIT_STATUS } from '@/app/modules/job/job.constant';
import { Job } from '@/app/modules/job/job.model';
import { USER_ROLE } from '@/app/modules/user/user.constant';

const depositPopulate = [
  { path: 'rider', select: 'name email phone profileAvatar' },
  { path: 'vendor', select: 'name email phone profileAvatar' },
  { path: 'order', select: 'id totalAmount status paymentStatus' },
  { path: 'job', select: 'id status depositStatus collectedMoney earning' },
];

/** Rider submits COD deposit proof. */
const submitDeposit = async (
  traceId: string,
  riderId: string,
  payload: TSubmitDepositPayload
) => {
  const job = await getDepositableJobOrThrow(traceId, payload.jobId, riderId);

  const deposit = await Deposit.findOneAndUpdate(
    { job: job._id },
    {
      rider: job.rider,
      job: job._id,
      order: job.order,
      vendor: job.vendor,
      amount: job.collectedMoney,
      reference: payload.reference,
      files: payload.files ?? [],
      status: DEPOSIT_STATUS.submitted,
      rejectionReason: null,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).populate(depositPopulate);

  await Job.findByIdAndUpdate(job._id, {
    depositStatus: JOB_DEPOSIT_STATUS.submitted,
    depositReference: payload.reference,
    depositedAt: new Date(),
  });

  return deposit;
};

/** Admin verifies or rejects submitted COD deposit. */
const verifyDeposit = async (
  traceId: string,
  requester: TDepositRequester,
  depositId: string,
  payload: TVerifyDepositPayload
) => {
  if (payload.status === DEPOSIT_STATUS.rejected && !payload.reason) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Rejection reason is required', traceId);
  }

  const deposit = await getDepositOrThrow(traceId, depositId);
  deposit.status = payload.status;
  deposit.verifiedBy = requester.userId as any;
  deposit.rejectionReason =
    payload.status === DEPOSIT_STATUS.rejected ? payload.reason! : null;
  await deposit.save();

  await Job.findByIdAndUpdate(deposit.job, {
    depositStatus: resolveJobDepositStatus(payload.status),
  });

  return Deposit.findById(deposit._id).populate(depositPopulate);
};

/** Admin gets all deposits with pagination. */
const getAll = async (query: Record<string, unknown>) => {
  const depositQuery = new QueryBuilder(
    Deposit.find().populate(depositPopulate).select('-__v').lean(),
    query
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const [data, meta] = await Promise.all([
    depositQuery.modelQuery,
    depositQuery.countTotal(),
  ]);

  return { meta, data };
};

/** Rider gets own deposits with pagination. */
const getMy = async (riderId: string, query: Record<string, unknown>) => {
  const depositQuery = new QueryBuilder(
    Deposit.find({ rider: riderId }).populate(depositPopulate).select('-__v').lean(),
    query
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const [data, meta] = await Promise.all([
    depositQuery.modelQuery,
    depositQuery.countTotal(),
  ]);

  return { meta, data };
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

  const canAccess =
    requester.role === USER_ROLE.admin ||
    deposit.rider?._id?.toString?.() === requester.userId ||
    deposit.vendor?._id?.toString?.() === requester.userId;
  if (!canAccess) {
    throw new ApiError(HttpStatusCode.Forbidden, 'You cannot access this deposit', traceId);
  }

  return deposit;
};

export const DepositService = {
  submitDeposit,
  verifyDeposit,
  getAll,
  getMy,
  getById,
};




