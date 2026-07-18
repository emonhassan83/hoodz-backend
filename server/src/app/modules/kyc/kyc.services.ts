import { HttpStatusCode } from 'axios';

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

/** Returns all KYC requests for admin review. */
const getAll = async () =>
  Kyc.find()
    .populate('user', 'name email countryCode phone status profileAvatar')
    .sort({ createdAt: -1 })
    .select('-__v');

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
  changeStatus,
};
