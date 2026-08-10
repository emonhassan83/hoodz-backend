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
    $inc: { walletBalance: amount, balance: amount },
  });

  return updatedTopUp;
};
