import { Model, Schema, Types, model } from 'mongoose';

export const ORDER_AUDIT_ACTION = {
  status_change: 'status_change',
  reversal: 'reversal',
  amount_change: 'amount_change',
} as const;

export type TOrderAuditAction =
  (typeof ORDER_AUDIT_ACTION)[keyof typeof ORDER_AUDIT_ACTION];

export interface IOrderAuditLog {
  _id: Types.ObjectId;
  order: Types.ObjectId;
  action: TOrderAuditAction;
  fromStatus?: string | null;
  toStatus?: string | null;
  fromAmount?: number | null;
  toAmount?: number | null;
  performedBy?: Types.ObjectId | null;
  performerRole?: string | null;
  reason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type IOrderAuditLogModel = Model<
  IOrderAuditLog,
  Record<string, unknown>
>;

const orderAuditLogSchema = new Schema<IOrderAuditLog, IOrderAuditLogModel>(
  {
    order: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: Object.values(ORDER_AUDIT_ACTION),
      required: true,
      index: true,
    },
    fromStatus: { type: String, default: null },
    toStatus: { type: String, default: null },
    fromAmount: { type: Number, default: null },
    toAmount: { type: Number, default: null },
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    performerRole: { type: String, default: null },
    reason: { type: String, default: null, trim: true },
  },
  {
    timestamps: true,
  }
);

export const OrderAuditLog = model<IOrderAuditLog, IOrderAuditLogModel>(
  'OrderAuditLog',
  orderAuditLogSchema
);
