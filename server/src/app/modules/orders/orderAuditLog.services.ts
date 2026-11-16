import { Types } from 'mongoose';

import {
  IOrderAuditLog,
  OrderAuditLog,
  TOrderAuditAction,
} from '@/app/modules/orders/orderAuditLog.model';

export type TLogDeliveredOrderChange = {
  orderId: Types.ObjectId | string;
  action: TOrderAuditAction;
  fromStatus?: string | null;
  toStatus?: string | null;
  fromAmount?: number | null;
  toAmount?: number | null;
  performedBy?: string | null;
  performerRole?: string | null;
  reason?: string | null;
};

/**
 * Records a change made to an already-delivered order (status change,
 * amount change, or an admin reversal). Auditing must never break the
 * order flow, so failures are swallowed by design.
 */
export const logDeliveredOrderChange = async (
  entry: TLogDeliveredOrderChange
): Promise<IOrderAuditLog | null> => {
  try {
    return await OrderAuditLog.create({
      order: entry.orderId,
      action: entry.action,
      fromStatus: entry.fromStatus ?? null,
      toStatus: entry.toStatus ?? null,
      fromAmount: entry.fromAmount ?? null,
      toAmount: entry.toAmount ?? null,
      performedBy: entry.performedBy ?? null,
      performerRole: entry.performerRole ?? null,
      reason: entry.reason ?? null,
    });
  } catch {
    return null;
  }
};
