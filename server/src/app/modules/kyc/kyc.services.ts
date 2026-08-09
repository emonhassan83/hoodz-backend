import { HttpStatusCode } from 'axios';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import { KYC_STATUS } from '@/app/modules/kyc/kyc.constant';
import {
  assertKycBelongsToRequester,
  assertRiderCanSubmitKyc,
  buildKycStatusNotification,
  sendKycStatusEmail,
  sendKycStatusNotification,
} from '@/app/modules/kyc/kyc.helpers';
import { Kyc } from '@/app/modules/kyc/kyc.model';
import {
  TAddKycPayload,
  TChangeKycStatusPayload,
  TKycRequester,
  TUpdateKycPayload,
} from '@/app/modules/kyc/kyc.types';
import { USER_STATUS } from '@/app/modules/user/user.constant';
import { User } from '@/app/modules/user/user.model';

/** Creates or replaces a rider KYC request in pending state. */
const addKycRequest = async (
  traceId: string,
  riderId: string,
  payload: TAddKycPayload
) => {
  const rider = await User.findById(riderId).select('role status');
  assertRiderCanSubmitKyc(rider, traceId);

  const existingKyc = await Kyc.findOne({ user: riderId });
  if (existingKyc?.status === KYC_STATUS.approved) {
    throw new ApiError(HttpStatusCode.Conflict, 'KYC is already approved', traceId);
  }

  const kyc = await Kyc.findOneAndUpdate(
    { user: riderId },
    {
      ...payload,
      user: riderId,
      status: KYC_STATUS.pending,
      rejectedReason: null,
    },
    { upsert: true, returnDocument: 'after' }
  ).select('-__v');

  return kyc;
};

/** Returns paginated KYC requests for admin review. */
const getAll = async (query: Record<string, unknown>) => {
  const kycQuery = new QueryBuilder(
    Kyc.find().populate(
      'user',
      'name email countryCode phone status profileAvatar'
    ),
    query
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const [kycs, meta] = await Promise.all([
    kycQuery.modelQuery,
    kycQuery.countTotal(),
  ]);

  return { meta, data: kycs };
};

/** Returns one KYC request after requester ownership/access check. */
const getA = async (traceId: string, kycId: string, requester: TKycRequester) => {
  const kyc = await Kyc.findById(kycId)
    .populate('user', 'name email countryCode phone status profileAvatar')
    .select('-__v');

  if (!kyc) {
    throw new ApiError(HttpStatusCode.NotFound, 'KYC not found', traceId);
  }

  assertKycBelongsToRequester(kyc, requester, traceId);

  return kyc;
};

/** Lets riders update their own approved/rejected/pending KYC and resubmit for admin review. */
const updateMyKyc = async (
  traceId: string,
  riderId: string,
  payload: TUpdateKycPayload
) => {
  const rider = await User.findById(riderId).select('role status');
  assertRiderCanSubmitKyc(rider, traceId);

  const kyc = await Kyc.findOne({ user: riderId });
  if (!kyc) {
    throw new ApiError(HttpStatusCode.NotFound, 'KYC not found', traceId);
  }

  if (payload.vehicle !== undefined) kyc.vehicle = payload.vehicle as any;
  if (payload.license !== undefined) kyc.license = payload.license;
  if (payload.nationalId !== undefined) kyc.nationalId = payload.nationalId;
  kyc.status = KYC_STATUS.pending as any;
  kyc.rejectedReason = null;

  await Promise.all([
    kyc.save(),
    User.findByIdAndUpdate(riderId, { status: USER_STATUS.pending }),
  ]);

  return Kyc.findById(kyc._id).select('-__v');
};

/** Updates KYC status and notifies the rider by push and email. */
const changeStatus = async (
  traceId: string,
  kycId: string,
  payload: TChangeKycStatusPayload
) => {
  const kyc = await Kyc.findById(kycId);
  if (!kyc) {
    throw new ApiError(HttpStatusCode.NotFound, 'KYC not found', traceId);
  }

  const rider = await User.findById(kyc.user).select('name email fcmToken status role');
  if (!rider || rider.isDeleted) {
    throw new ApiError(HttpStatusCode.NotFound, 'Rider not found', traceId);
  }

  kyc.status = payload.status as any;
  kyc.rejectedReason =
    payload.status === KYC_STATUS.rejected ? payload.rejectedReason : null;
  await kyc.save();

  if (payload.status === KYC_STATUS.approved) {
    await User.findByIdAndUpdate(kyc.user, { status: USER_STATUS.active });
  }

  const { title, message } = buildKycStatusNotification(
    payload.status,
    payload.rejectedReason
  );

  await Promise.all([
    sendKycStatusNotification(rider, title, message, kyc._id.toString()),
    sendKycStatusEmail({
      email: rider.email,
      name: rider.name,
      status: payload.status,
      rejectedReason: payload.rejectedReason,
    }),
  ]);

  return Kyc.findById(kycId)
    .populate('user', 'name email countryCode phone status profileAvatar')
    .select('-__v');
};

export const KycService = {
  addKycRequest,
  getAll,
  getA,
  updateMyKyc,
  changeStatus,
};


