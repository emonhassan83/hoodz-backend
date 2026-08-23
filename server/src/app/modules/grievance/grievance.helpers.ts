import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import {
  GRIEVANCE_RESOLUTION_TYPE,
  GRIEVANCE_STATUS,
} from '@/app/modules/grievance/grievance.constant';
import { IGrievance } from '@/app/modules/grievance/grievance.interface';
import { Orders } from '@/app/modules/orders/orders.model';
import { USER_ROLE } from '@/app/modules/user/user.constant';

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
  grievance: Pick<IGrievance, 'user'>,
  requester: { userId: string; role: string },
  mutate = false
) => {
  const isSupport = [USER_ROLE.admin, USER_ROLE.agent].includes(
    requester.role as any
  );
  const isOwner = grievance.user.toString() === requester.userId;

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
export const assertResolutionPayload = (
  traceId: string,
  payload: {
    status: string;
    resolutionType?: string;
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
  }
};
