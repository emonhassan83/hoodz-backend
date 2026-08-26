import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import {
  GRIEVANCE_RESOLUTION_TYPE,
  GRIEVANCE_STATUS,
} from '@/app/modules/grievance/grievance.constant';
import { IGrievance } from '@/app/modules/grievance/grievance.interface';
import { NOTIFICATION_MODEL_TYPE } from '@/app/modules/notification/notification.constant';
import { Orders } from '@/app/modules/orders/orders.model';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import { sendNotificationViaQueue } from '@/app/utils/notification-queue.service';

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
  const isOwner =
    String((grievance.user as any)?._id ?? grievance.user) === requester.userId;

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

const toPlain = (value: Record<string, any> | null | undefined) => {
  if (!value) return null;
  if (typeof (value as any).toObject === 'function') {
    return (value as any).toObject();
  }
  return value;
};

/** Formats one grievance row for list responses. */
export const formatGrievanceListItem = (grievance: Record<string, any>) => {
  const doc = toPlain(grievance) ?? grievance;
  const user =
    doc.user && typeof doc.user === 'object' && doc.user._id
      ? { _id: doc.user._id, name: doc.user.name ?? '' }
      : doc.user
        ? { _id: doc.user, name: '' }
        : null;
  const order =
    doc.order && typeof doc.order === 'object' && doc.order._id
      ? { _id: doc.order._id, id: doc.order.id ?? null }
      : doc.order
        ? { _id: doc.order, id: null }
        : null;

  return {
    _id: doc._id,
    user,
    order,
    issueType: doc.issueType,
    description: doc.description,
    files: doc.files ?? [],
    status: doc.status,
    createdAt: doc.createdAt,
  };
};

/** Formats one grievance for detail responses. */
export const formatGrievanceDetails = (grievance: Record<string, any>) => {
  const doc = toPlain(grievance) ?? grievance;
  const user =
    doc.user && typeof doc.user === 'object' && doc.user._id
      ? {
          _id: doc.user._id,
          name: doc.user.name ?? '',
          email: doc.user.email ?? null,
          profileAvatar: doc.user.profileAvatar ?? null,
          phone: doc.user.phone ?? null,
        }
      : doc.user
        ? {
            _id: doc.user,
            name: '',
            email: null,
            profileAvatar: null,
            phone: null,
          }
        : null;

  const order =
    doc.order && typeof doc.order === 'object' && doc.order._id
      ? {
          billingDetails: doc.order.billingDetails ?? null,
          _id: doc.order._id,
          author: doc.order.author ?? null,
          amount: doc.order.amount,
          deliveryCharge: doc.order.deliveryCharge,
          totalAmount: doc.order.totalAmount,
          status: doc.order.status,
          paymentStatus: doc.order.paymentStatus,
          id: doc.order.id ?? null,
        }
      : doc.order
        ? {
            billingDetails: null,
            _id: doc.order,
            author: null,
            amount: 0,
            deliveryCharge: 0,
            totalAmount: 0,
            status: null,
            paymentStatus: null,
            id: null,
          }
        : null;

  return {
    _id: doc._id,
    user,
    order,
    issueType: doc.issueType,
    description: doc.description,
    files: doc.files ?? [],
    status: doc.status,
    resolutionType: doc.resolutionType,
    note: doc.note ?? null,
    resolvedAt: doc.resolvedAt ?? null,
    rejectAt: doc.rejectAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
};

/** Notifies the grievance owner when support changes status. */
export const notifyGrievanceStatusChanged = async (grievance: {
  _id: unknown;
  user: unknown;
  status: string;
  issueType?: string;
  order?: unknown;
}) => {
  const userId = String((grievance.user as any)?._id ?? grievance.user ?? '');
  if (!userId) return;

  const isResolved = grievance.status === GRIEVANCE_STATUS.resolved;
  const title = isResolved ? 'Grievance resolved' : 'Grievance rejected';
  const message = isResolved
    ? 'Your grievance has been resolved.'
    : 'Your grievance has been rejected.';

  await sendNotificationViaQueue({
    userId,
    channel: 'both',
    title,
    message,
    data: {
      modelType: NOTIFICATION_MODEL_TYPE.Grievance,
      reference: String(grievance._id),
      status: grievance.status,
      issueType: grievance.issueType ?? null,
      orderId: String(
        (grievance.order as any)?._id ?? grievance.order ?? ''
      ),
    },
  }).catch((error) => {
    console.warn('[Grievance] Failed to queue status notification', error);
  });
};
