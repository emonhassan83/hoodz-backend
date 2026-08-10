import { HttpStatusCode } from 'axios';
import mongoose from 'mongoose';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import {
  GRIEVANCE_RESOLUTION_TYPE,
  GRIEVANCE_STATUS,
} from '@/app/modules/grievance/grievance.constant';
import {
  assertGrievanceAccess,
  assertGrievanceExists,
  assertGrievanceStatusTransition,
  assertResolutionPayload,
  getUserOrderForGrievanceOrThrow,
} from '@/app/modules/grievance/grievance.helpers';
import { Grievance } from '@/app/modules/grievance/grievance.model';
import {
  TCreateGrievancePayload,
  TGrievanceRequester,
  TResolveGrievancePayload,
} from '@/app/modules/grievance/grievance.types';
import { User } from '@/app/modules/user/user.model';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import {
  WALLET_TRANSACTION_DIRECTION,
  WALLET_TRANSACTION_REFERENCE_TYPE,
  WALLET_TRANSACTION_TYPE,
} from '@/app/modules/walletTransaction/walletTransaction.constant';
import { WalletTransactionService } from '@/app/modules/walletTransaction/walletTransaction.services';

const grievancePopulate = [
  { path: 'userId', select: 'name email phone profileAvatar walletBalance balance' },
  { path: 'orderId', select: 'id amount deliveryCharge totalAmount status paymentStatus billingDetails author' },
  { path: 'compensationVoucher', select: 'code title voucherType discountType discountValue giftDetails expiryDate status' },
  { path: 'resolvedBy', select: 'name email role profileAvatar' },
];

/** Creates a grievance from a user's own order. */
const createGrievance = async (
  traceId: string,
  userId: string,
  payload: TCreateGrievancePayload
) => {
  await getUserOrderForGrievanceOrThrow(traceId, userId, payload.orderId);

  const existingOpenCase = await Grievance.findOne({
    userId,
    orderId: payload.orderId,
    issueType: payload.issueType,
    status: { $in: [GRIEVANCE_STATUS.submitted, GRIEVANCE_STATUS.under_review] },
    isDeleted: false,
  });
  if (existingOpenCase) {
    throw new ApiError(
      HttpStatusCode.Conflict,
      'You already have an open grievance for this issue',
      traceId
    );
  }

  const grievance = await Grievance.create({
    userId,
    orderId: payload.orderId,
    issueType: payload.issueType,
    description: payload.description,
  });

  return Grievance.findById(grievance._id).populate(grievancePopulate).select('-__v');
};

/** Returns paginated grievances; users see own, support sees all. */
const getAllGrievances = async (
  query: Record<string, unknown>,
  requester: TGrievanceRequester
) => {
  const filter =
    requester.role === USER_ROLE.user
      ? { userId: requester.userId, isDeleted: false }
      : { isDeleted: false };

  const grievanceQuery = new QueryBuilder(
    Grievance.find(filter)
      .populate(grievancePopulate)
      .select('-__v')
      .lean(),
    query
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const [data, meta] = await Promise.all([
    grievanceQuery.modelQuery,
    grievanceQuery.countTotal(),
  ]);

  return { meta, data };
};

/** Returns one grievance after access verification. */
const getAGrievance = async (
  traceId: string,
  grievanceId: string,
  requester: TGrievanceRequester
) => {
  const grievance = await Grievance.findOne({ _id: grievanceId, isDeleted: false })
    .populate(grievancePopulate)
    .select('-__v');
  assertGrievanceExists(grievance, traceId);
  assertGrievanceAccess(traceId, grievance!, requester);

  return grievance;
};

/** Updates grievance review/resolution and credits wallet refunds once. */
const resolveGrievance = async (
  traceId: string,
  grievanceId: string,
  requester: TGrievanceRequester,
  payload: TResolveGrievancePayload
) => {
  const grievance = await Grievance.findOne({ _id: grievanceId, isDeleted: false });
  assertGrievanceExists(grievance, traceId);
  assertGrievanceAccess(traceId, grievance!, requester, true);
  assertGrievanceStatusTransition(traceId, grievance!.status, payload.status);
  await assertResolutionPayload(traceId, grievance!, payload);

  if (
    payload.status === GRIEVANCE_STATUS.resolved &&
    payload.resolutionType === GRIEVANCE_RESOLUTION_TYPE.wallet
  ) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      const currentGrievance = await Grievance.findOne({
        _id: grievanceId,
        isDeleted: false,
      }).session(session);
      assertGrievanceExists(currentGrievance, traceId);

      if (currentGrievance!.isWalletRefundCredited) {
        throw new ApiError(
          HttpStatusCode.BadRequest,
          'Wallet refund already credited for this grievance',
          traceId
        );
      }

      const refundAmount = Number((payload.refundAmount ?? 0).toFixed(2));
      await User.findByIdAndUpdate(
        currentGrievance!.userId,
        { $inc: { walletBalance: refundAmount, balance: refundAmount } },
        { session }
      );

      currentGrievance!.status = GRIEVANCE_STATUS.resolved;
      currentGrievance!.resolutionType = GRIEVANCE_RESOLUTION_TYPE.wallet;
      currentGrievance!.refundAmount = refundAmount;
      currentGrievance!.compensationVoucher = null;
      currentGrievance!.note = payload.note ?? null;
      currentGrievance!.resolvedBy = new mongoose.Types.ObjectId(requester.userId);
      currentGrievance!.resolvedAt = new Date();
      currentGrievance!.isWalletRefundCredited = true;
      await currentGrievance!.save({ session });

      await session.commitTransaction();

      await WalletTransactionService.createWalletTransaction({
        user: currentGrievance!.userId.toString(),
        type: WALLET_TRANSACTION_TYPE.refund_credit,
        amount: refundAmount,
        direction: WALLET_TRANSACTION_DIRECTION.credit,
        referenceType: WALLET_TRANSACTION_REFERENCE_TYPE.Grievance,
        reference: currentGrievance!._id.toString(),
        note: 'Wallet refund credited from grievance resolution',
      });

      return Grievance.findById(grievanceId).populate(grievancePopulate).select('-__v');
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  grievance!.status = payload.status;
  grievance!.resolutionType =
    payload.status === GRIEVANCE_STATUS.resolved
      ? payload.resolutionType ?? GRIEVANCE_RESOLUTION_TYPE.none
      : GRIEVANCE_RESOLUTION_TYPE.none;
  grievance!.compensationVoucher =
    payload.status === GRIEVANCE_STATUS.resolved &&
    payload.resolutionType === GRIEVANCE_RESOLUTION_TYPE.voucher
      ? new mongoose.Types.ObjectId(payload.compensationVoucher!)
      : null;
  grievance!.refundAmount = 0;
  grievance!.note = payload.note ?? null;
  const isClosingStatus =
    payload.status === GRIEVANCE_STATUS.resolved ||
    payload.status === GRIEVANCE_STATUS.rejected;
  grievance!.resolvedBy = isClosingStatus
    ? new mongoose.Types.ObjectId(requester.userId)
    : null;
  grievance!.resolvedAt = isClosingStatus ? new Date() : null;
  await grievance!.save();

  return Grievance.findById(grievanceId).populate(grievancePopulate).select('-__v');
};

/** Soft deletes a grievance after access verification. */
const deleteGrievance = async (
  traceId: string,
  grievanceId: string,
  requester: TGrievanceRequester
) => {
  const grievance = await Grievance.findOne({ _id: grievanceId, isDeleted: false });
  assertGrievanceExists(grievance, traceId);
  assertGrievanceAccess(traceId, grievance!, requester, true);

  return Grievance.findByIdAndUpdate(
    grievanceId,
    { isDeleted: true },
    { returnDocument: 'after' }
  ).select('-__v');
};

export const GrievanceService = {
  createGrievance,
  getAllGrievances,
  getAGrievance,
  resolveGrievance,
  deleteGrievance,
};
