import { HttpStatusCode } from 'axios';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import {
  PAYMENT_STATUS as ORDER_PAYMENT_STATUS,
} from '@/app/modules/orders/orders.constant';
import { CoinService } from '@/app/modules/coin/coin.services';
import { notifyOrdersPaid } from '@/app/modules/orders/orders.helpers';
import { emitOrdersPaidUpdated } from '@/app/modules/orders/orders.socket';
import { Orders } from '@/app/modules/orders/orders.model';
import { PAYMENT_METHOD, PAYMENT_STATUS } from '@/app/modules/payment/payment.constant';
import {
  formatPaymentTransaction,
  getPayableOrdersOrThrow,
  initiateCodPayment,
  paymentPopulate,
} from '@/app/modules/payment/payment.helpers';
import { Payment } from '@/app/modules/payment/payment.model';
import {
  TConfirmPaymentPayload,
  TInitiatePaymentPayload,
} from '@/app/modules/payment/payment.types';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import { User } from '@/app/modules/user/user.model';

const initiatePayment = async (
  traceId: string,
  userId: string,
  payload: TInitiatePaymentPayload
) => {
  const { orders, amount } = await getPayableOrdersOrThrow(
    traceId,
    userId,
    payload.orderIds
  );

  if (payload.paymentMethod !== PAYMENT_METHOD.cod) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Only cash on delivery is accepted',
      traceId
    );
  }

  return initiateCodPayment(traceId, userId, payload, orders);
};

const confirmPayment = async (
  traceId: string,
  userId: string,
  payload: TConfirmPaymentPayload
) => {
  const payment = await Payment.findOne({
    _id: payload.paymentId,
    account: userId,
    isDeleted: false,
  });

  if (!payment) {
    throw new ApiError(HttpStatusCode.NotFound, 'Payment not found', traceId);
  }

  if (payment.paymentMethod !== PAYMENT_METHOD.cod) {
    throw new ApiError(
      HttpStatusCode.Gone,
      'Online payment confirmation is disabled',
      traceId
    );
  }

  // Cash on delivery only: the collected-cash result is recorded directly.
  // There is no online gateway to verify the transaction against.
  const status = payload.success ? PAYMENT_STATUS.paid : PAYMENT_STATUS.failed;
  const transactionId = payload.transactionId ?? null;

  const alreadyPaid = payment.isPaid;

  payment.status = status;
  payment.isPaid = status === PAYMENT_STATUS.paid;
  payment.transactionId = transactionId;
  payment.paymentIntentId = payload.paymentIntentId ?? payment.paymentIntentId;
  await payment.save();

  const orderUpdate =
    status === PAYMENT_STATUS.paid
      ? {
          paymentStatus: ORDER_PAYMENT_STATUS.paid,
          transactionId,
        }
      : {
          paymentStatus: ORDER_PAYMENT_STATUS.failed,
          transactionId,
        };

  await Orders.findByIdAndUpdate(payment.order, {
    ...orderUpdate,
  });

  if (status === PAYMENT_STATUS.paid && !alreadyPaid) {
    await CoinService.processPaidOrderRewards([payment.order]);
    await notifyOrdersPaid([payment.order]);
    await emitOrdersPaidUpdated([payment.order]);
  }

  return payment.populate(paymentPopulate);
};

const getAllPayments = async (
  query: Record<string, unknown>,
  requester: { userId: string; role: string }
) => {
  const filter =
    requester.role === USER_ROLE.admin
      ? { isDeleted: false }
      : { account: requester.userId, isDeleted: false };

  const paymentQuery = new QueryBuilder(
    Payment.find(filter).populate(paymentPopulate).select('-__v').lean(),
    query
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const [payments, meta] = await Promise.all([
    paymentQuery.modelQuery,
    paymentQuery.countTotal(),
  ]);

  return { meta, data: payments };
};

const getAPayment = async (
  traceId: string,
  paymentId: string,
  requester: { userId: string; role: string }
) => {
  const payment = await Payment.findOne({
    _id: paymentId,
    isDeleted: false,
  })
    .populate(paymentPopulate)
    .select('-__v')
    .lean();

  if (!payment) {
    throw new ApiError(HttpStatusCode.NotFound, 'Payment not found', traceId);
  }

  const canViewAny =
    requester.role === USER_ROLE.admin || requester.role === USER_ROLE.agent;
  const paymentAccountId = String(
    (payment.account as any)?._id ?? payment.account ?? ''
  );

  if (!canViewAny && paymentAccountId !== requester.userId) {
    throw new ApiError(
      HttpStatusCode.Forbidden,
      'You are not allowed to access this payment',
      traceId
    );
  }

  return payment;
};

/** Returns wallet balance and paginated payments for the logged-in user. */
const getUserTransactionHistory = async (
  userId: string,
  query: Record<string, unknown>
) => {
  const paymentQuery = new QueryBuilder(
    Payment.find({ account: userId, isDeleted: false })
      .populate({ path: 'order', select: '_id id' })
      .select(
        '_id order transactionId paymentIntentId subtotalAmount coinDiscount deliveryCharge amount status paymentMethod isPaid id createdAt'
      )
      .lean(),
    query
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const [payments, meta, user] = await Promise.all([
    paymentQuery.modelQuery,
    paymentQuery.countTotal(),
    User.findById(userId).select('walletBalance').lean(),
  ]);

  return {
    meta,
    data: {
      walletBalance: Number((user?.walletBalance ?? 0).toFixed(2)),
      transactions: (payments as Record<string, any>[]).map(
        formatPaymentTransaction
      ),
    },
  };
};

export const PaymentService = {
  initiatePayment,
  confirmPayment,
  getAllPayments,
  getAPayment,
  getUserTransactionHistory,
};
