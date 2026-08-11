import { HttpStatusCode } from 'axios';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import { DEPOSIT_STATUS } from '@/app/modules/deposit/deposit.constant';
import {
  getDepositOrThrow,
  getDepositableJobsOrThrow,
} from '@/app/modules/deposit/deposit.helpers';
import { Deposit } from '@/app/modules/deposit/deposit.model';
import {
  TDepositRequester,
  TSubmitDepositPayload,
  TVerifyDepositPayload,
} from '@/app/modules/deposit/deposit.types';
import { USER_ROLE } from '@/app/modules/user/user.constant';

const depositPopulate = [
  { path: 'author', select: 'name email phone profileAvatar' },
  { path: 'jobIds', select: 'id status collectedMoney earning order rider paymentMethod' },
];

/** Rider submits COD deposit proof. */
const submitDeposit = async (
  traceId: string,
  riderId: string,
  payload: TSubmitDepositPayload
) => {
  const jobs = await getDepositableJobsOrThrow(traceId, payload.jobIds, riderId);
  const calculatedAmount = Number(
    jobs.reduce((total, job) => total + job.collectedMoney, 0).toFixed(2)
  );
  if (calculatedAmount !== Number(payload.amount.toFixed(2))) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Deposit amount does not match selected COD jobs amount',
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

  return Deposit.findById(deposit._id).populate(depositPopulate);
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
    Deposit.find({ author: riderId }).populate(depositPopulate).select('-__v').lean(),
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
    deposit.author?._id?.toString?.() === requester.userId;
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




