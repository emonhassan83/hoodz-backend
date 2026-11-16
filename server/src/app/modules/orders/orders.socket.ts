import { Types } from 'mongoose';

import { ORDER_STATUS } from '@/app/modules/orders/orders.constant';
import { getOrderListCardById } from '@/app/modules/orders/orders.helpers';
import { Orders } from '@/app/modules/orders/orders.model';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import { getIO } from '@/app/socket/socket.init';
import {
  emitToRoles,
  emitToUserIds,
  orderTrackRoom,
} from '@/app/socket/utils/jobSocket.helpers';

export type TOrderSocketNotice =
  | 'created'
  | 'accepted'
  | 'confirmed'
  | 'preparing'
  | 'processing'
  | 'out_for_delivery'
  | 'paid'
  | 'status_changed'
  | 'cancelled'
  | 'rejected'
  | 'rider_assigned'
  | 'collected'
  | 'picked_up'
  | 'on_the_way'
  | 'delivered'
  | 'escalated';

const STATUS_NOTICE_MAP: Partial<Record<string, TOrderSocketNotice>> = {
  [ORDER_STATUS.cancelled]: 'cancelled',
  [ORDER_STATUS.rejected]: 'rejected',
  [ORDER_STATUS.accepted]: 'accepted',
  [ORDER_STATUS.confirmed]: 'confirmed',
  [ORDER_STATUS.preparing]: 'preparing',
  [ORDER_STATUS.processing]: 'processing',
  [ORDER_STATUS.out_for_delivery]: 'out_for_delivery',
  [ORDER_STATUS.collected]: 'collected',
  [ORDER_STATUS.rider_assigned]: 'rider_assigned',
  [ORDER_STATUS.picked_up]: 'picked_up',
  [ORDER_STATUS.on_the_way]: 'on_the_way',
  [ORDER_STATUS.delivered]: 'delivered',
};

const toIdString = (value: unknown) =>
  String((value as { _id?: unknown })?._id ?? value ?? '').trim();

/** Maps order status to a socket notice when not explicitly provided. */
export const resolveOrderSocketNotice = (
  status?: string | null
): TOrderSocketNotice =>
  (status && STATUS_NOTICE_MAP[status]) || 'status_changed';

/** Broadcasts order create/status updates to customer, vendor, admin, and agent rooms. */
export const emitOrderUpdated = async (
  orderInput: string | Types.ObjectId | Record<string, unknown>,
  notice: TOrderSocketNotice,
  options?: { previousStatus?: string | null }
) => {
  try {
    const orderId = toIdString(orderInput);
    if (!orderId || orderId === 'undefined') return;

    const order = await Orders.findOne({ _id: orderId, isDeleted: false })
      .select('user author')
      .lean();
    if (!order) return;

    const orderCard = await getOrderListCardById(orderId);
    if (!orderCard) return;

    const customerId = toIdString(order.user);
    const vendorId = toIdString(order.author);

    const payload = {
      notice,
      previousStatus: options?.previousStatus ?? null,
      order: orderCard,
    };

    emitToUserIds(
      [customerId, vendorId].filter((id) => id && id !== 'undefined'),
      SOCKET_EMIT.orderUpdated,
      payload
    );
    emitToRoles(
      [USER_ROLE.admin, USER_ROLE.agent],
      SOCKET_EMIT.orderUpdated,
      payload
    );
    getIO().to(orderTrackRoom(orderId)).emit(SOCKET_EMIT.orderUpdated, payload);
  } catch (error) {
    console.warn(
      '[Order Socket] Failed to emit order:updated',
      error instanceof Error ? error.message : error
    );
  }
};

/** Emits paid notices for one or more orders after payment succeeds. */
export const emitOrdersPaidUpdated = async (
  orderIds: Array<string | Types.ObjectId>
) => {
  const uniqueOrderIds = [...new Set(orderIds.map((id) => id.toString()))];
  await Promise.all(
    uniqueOrderIds.map((orderId) => emitOrderUpdated(orderId, 'paid'))
  );
};
