import { HttpStatusCode } from 'axios';
import { Types } from 'mongoose';

import ApiError from '@/app/errors/ApiError';
import { TOP_UP_STATUS } from '@/app/modules/topUp/topUp.constant';
import { TopUp } from '@/app/modules/topUp/topUp.model';
import { User } from '@/app/modules/user/user.model';

/** Builds a merchant reference that identifies a wallet top-up webhook. */
export const buildTopUpMerchantOrderId = (topUpId: string) =>
  `TU-${topUpId}-${Date.now()}`;

/** Resolves one top-up by Paymob order id or merchant reference. */
export const findTopUpByPaymobReference = async (
  paymentIntentId?: string,
  merchantOrderId?: string
) => {
  const query = [
    ...(paymentIntentId ? [{ paymentIntentId }] : []),
    ...(merchantOrderId
      ? [{ _id: merchantOrderId.split('-')[1] }]
      : []),
  ];

  if (query.length === 0) return null;
  return TopUp.findOne({ $or: query, isDeleted: false });
};

/** Credits the user's wallet once for a paid top-up. */
export const applyTopUpBalanceOnce = async (
  topUpId: Types.ObjectId,
  userId: Types.ObjectId,
  amount: number
) => {
  const appliedAt = new Date();
  const updatedTopUp = await TopUp.findOneAndUpdate(
    {
      _id: topUpId,
      balanceAppliedAt: null,
      isDeleted: false,
    },
    {
      status: TOP_UP_STATUS.paid,
      isPaid: true,
      balanceAppliedAt: appliedAt,
    },
    { new: true }
  );

  if (!updatedTopUp) return null;

  await User.findByIdAndUpdate(userId, {
    $inc: { walletBalance: amount },
  });

  return updatedTopUp;
};

const topUpListPopulate = [
  { path: 'user', select: 'name profileAvatar' },
  { path: 'savedCard', select: 'maskedPan last4 cardBrand cardSubType isDefault' },
];

/** Sums one amount field for matching documents. */
export const sumTopUpAmount = async (
  match: Record<string, unknown>,
  field = '$amount'
) => {
  const [result] = await TopUp.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: field } } },
  ]);

  return Number((result?.total ?? 0).toFixed(2));
};

/** Formats one top-up row for list responses. */
export const formatTopUpTransaction = (topUp: Record<string, any>) => {
  const user =
    topUp.user && typeof topUp.user === 'object' && topUp.user._id
      ? {
          _id: topUp.user._id,
          name: topUp.user.name ?? '',
          profileAvatar: topUp.user.profileAvatar ?? null,
        }
      : topUp.user
        ? { _id: topUp.user, name: '', profileAvatar: null }
        : null;

  return {
    _id: topUp._id,
    user,
    savedCard: topUp.savedCard ?? null,
    amount: topUp.amount,
    paymentMethod: topUp.paymentMethod,
    status: topUp.status,
    transactionId: topUp.transactionId ?? null,
    paymentIntentId: topUp.paymentIntentId ?? null,
    saveCardRequested: Boolean(topUp.saveCardRequested),
    isPaid: Boolean(topUp.isPaid),
    balanceAppliedAt: topUp.balanceAppliedAt ?? null,
    isDeleted: Boolean(topUp.isDeleted),
    id: topUp.id,
    createdAt: topUp.createdAt,
  };
};

export { topUpListPopulate };
