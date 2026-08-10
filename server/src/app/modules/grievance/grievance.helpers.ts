import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import {
  GRIEVANCE_RESOLUTION_TYPE,
  GRIEVANCE_STATUS,
} from '@/app/modules/grievance/grievance.constant';
import { IGrievance } from '@/app/modules/grievance/grievance.interface';
import { Orders } from '@/app/modules/orders/orders.model';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import { Voucher } from '@/app/modules/voucher/voucher.model';
import {
  VOUCHER_STATUS,
  VOUCHER_TYPE,
} from '@/app/modules/voucher/voucher.constant';

/** Throws when a grievance case does not exist. */
export const assertGrievanceExists = (
  grievance: unknown,
  traceId: string
) => {
  if (!grievance) {
    throw new ApiError(HttpStatusCode.NotFound, 'Grievance not found', traceId);
  }
};

/** Loads an order and checks user ownership for grievance submission. */
export const getUserOrderForGrievanceOrThrow = async (
  traceId: string,
  userId: string,
  orderId: string
) => {
  const order = await Orders.findOne({
    _id: orderId,
    user: userId,
    isDeleted: false,
  });
  if (!order) {
    throw new ApiError(HttpStatusCode.NotFound, 'Order not found', traceId);
  }

  return order;
};

/** Checks whether requester can view/mutate a grievance. */
export const assertGrievanceAccess = (
  traceId: string,
  grievance: Pick<IGrievance, 'userId'>,
  requester: { userId: string; role: string },
  mutate = false
) => {
  const isSupport = [USER_ROLE.admin, USER_ROLE.agent].includes(requester.role as any);
  const isOwner = grievance.userId.toString() === requester.userId;

  if (isSupport || (!mutate && isOwner)) return;

  throw new ApiError(
    HttpStatusCode.Forbidden,
    'You are not allowed to access this grievance',
    traceId
  );
};

/** Validates allowed grievance status transitions. */
export const assertGrievanceStatusTransition = (
  traceId: string,
  currentStatus: string,
  nextStatus: string
) => {
  const allowedTransitions: Record<string, string[]> = {
    [GRIEVANCE_STATUS.submitted]: [
      GRIEVANCE_STATUS.under_review,
      GRIEVANCE_STATUS.resolved,
      GRIEVANCE_STATUS.rejected,
    ],
    [GRIEVANCE_STATUS.under_review]: [
      GRIEVANCE_STATUS.resolved,
      GRIEVANCE_STATUS.rejected,
    ],
    [GRIEVANCE_STATUS.resolved]: [],
    [GRIEVANCE_STATUS.rejected]: [],
  };

  if (!allowedTransitions[currentStatus]?.includes(nextStatus)) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      `Invalid grievance status transition from ${currentStatus} to ${nextStatus}`,
      traceId
    );
  }
};

/** Validates resolution fields for support status updates. */
export const assertResolutionPayload = async (
  traceId: string,
  grievance: IGrievance,
  payload: {
    status: string;
    resolutionType?: string;
    compensationVoucher?: string | null;
    refundAmount?: number;
  }
) => {
  if (payload.status === GRIEVANCE_STATUS.rejected) return;

  if (payload.status !== GRIEVANCE_STATUS.resolved) {
    if (
      payload.resolutionType &&
      payload.resolutionType !== GRIEVANCE_RESOLUTION_TYPE.none
    ) {
      throw new ApiError(
        HttpStatusCode.BadRequest,
        'Resolution can be applied only when status is resolved',
        traceId
      );
    }
    return;
  }

  if (!payload.resolutionType || payload.resolutionType === GRIEVANCE_RESOLUTION_TYPE.none) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Resolution type is required', traceId);
  }

  if (payload.resolutionType === GRIEVANCE_RESOLUTION_TYPE.voucher) {
    if (!payload.compensationVoucher) {
      throw new ApiError(HttpStatusCode.BadRequest, 'Compensation voucher is required', traceId);
    }

    const voucher = await Voucher.findOne({
      _id: payload.compensationVoucher,
      user: grievance.userId,
      voucherType: VOUCHER_TYPE.compensation,
      status: VOUCHER_STATUS.active,
      expiryDate: { $gt: new Date() },
      isDeleted: false,
    });
    if (!voucher) {
      throw new ApiError(
        HttpStatusCode.BadRequest,
        'Valid active compensation voucher for this user is required',
        traceId
      );
    }
    return;
  }

  if (
    payload.resolutionType === GRIEVANCE_RESOLUTION_TYPE.wallet &&
    (!payload.refundAmount || payload.refundAmount <= 0)
  ) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Refund amount must be greater than 0', traceId);
  }
};
