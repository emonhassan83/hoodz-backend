import { ClientSession, Types } from 'mongoose';

import { COIN_EARNING_ACTION, COIN_TRANSACTION_STATUS, COIN_TRANSACTION_TYPE } from '@/app/modules/coin/coin.constant';
import { TCoinEarningAction } from '@/app/modules/coin/coin.interface';
import { CoinAccount, CoinTransaction } from '@/app/modules/coin/coin.model';
import { TReferenceId } from '@/app/modules/coin/coin.types';
import { NOTIFICATION_MODEL_TYPE } from '@/app/modules/notification/notification.constant';
import { sendNotificationViaQueue } from '@/app/utils/notification-queue.service';

type TCoinNotificationReference = string | Types.ObjectId | null | undefined;

export const addDays = (date: Date, days: number) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

export const toObjectId = (id: TReferenceId) =>
  typeof id === 'string' ? new Types.ObjectId(id) : id;

export const getMonthWindow = (date = new Date()) => {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return { start, end };
};

export const getOrCreateAccount = async (userId: string, session?: ClientSession) =>
  CoinAccount.findOneAndUpdate(
    { user: userId },
    {
      $setOnInsert: {
        user: userId,
        balance: 0,
        lastActivityAt: null,
        inactiveReminderSentAt: null,
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, session }
  );

export const expireOldCoins = async (
  userId: string,
  now = new Date(),
  session?: ClientSession
) =>
  CoinTransaction.updateMany(
    {
      user: userId,
      status: COIN_TRANSACTION_STATUS.active,
      remainingCoins: { $gt: 0 },
      expiresAt: { $lte: now },
    },
    {
      status: COIN_TRANSACTION_STATUS.expired,
      remainingCoins: 0,
    },
    { session }
  );

export const getActiveCoinStats = async (userId: string, now = new Date()) => {
  const [stats] = await CoinTransaction.aggregate([
    {
      $match: {
        user: new Types.ObjectId(userId),
        status: COIN_TRANSACTION_STATUS.active,
        remainingCoins: { $gt: 0 },
        expiresAt: { $gt: now },
      },
    },
    {
      $group: {
        _id: null,
        balance: { $sum: '$remainingCoins' },
        nextExpiryAt: { $min: '$expiresAt' },
      },
    },
  ]);

  const nextExpiryAt = stats?.nextExpiryAt ?? null;
  const expiringCoins = nextExpiryAt
    ? await CoinTransaction.aggregate([
        {
          $match: {
            user: new Types.ObjectId(userId),
            status: COIN_TRANSACTION_STATUS.active,
            remainingCoins: { $gt: 0 },
            expiresAt: nextExpiryAt,
          },
        },
        {
          $group: {
            _id: null,
            coins: { $sum: '$remainingCoins' },
          },
        },
      ])
    : [];

  return {
    balance: stats?.balance ?? 0,
    nextExpiryAt,
    expiringCoins: expiringCoins[0]?.coins ?? 0,
  };
};

export const getMonthlyEarnCount = async (
  userId: string,
  action: TCoinEarningAction,
  now = new Date()
) => {
  const { start, end } = getMonthWindow(now);
  return CoinTransaction.countDocuments({
    user: userId,
    type: COIN_TRANSACTION_TYPE.earn,
    action,
    createdAt: { $gte: start, $lt: end },
  });
};

export const syncAccountBalance = async (userId: string, now = new Date()) => {
  const stats = await getActiveCoinStats(userId, now);
  await CoinAccount.findOneAndUpdate(
    { user: userId },
    { balance: stats.balance },
    { upsert: true }
  );
  return stats.balance;
};

const getEarnedCoinMessage = (
  action: (typeof COIN_EARNING_ACTION)[keyof typeof COIN_EARNING_ACTION],
  coins: number
) => {
  const descriptions = {
    [COIN_EARNING_ACTION.account_creation]: `You earned ${coins} welcome bonus coins.`,
    [COIN_EARNING_ACTION.profile_completion]: `You earned ${coins} coins for completing your profile.`,
    [COIN_EARNING_ACTION.purchase]: `You earned ${coins} coins from your order.`,
    [COIN_EARNING_ACTION.product_review]: `You earned ${coins} coins for your product review.`,
    [COIN_EARNING_ACTION.photo_review]: `You earned ${coins} coins for your photo review.`,
    [COIN_EARNING_ACTION.referral_inviter]: `You earned ${coins} coins after your friend placed their first order.`,
    [COIN_EARNING_ACTION.referral_invitee]: `You earned ${coins} referral coins on your first order.`,
  };

  return descriptions[action] ?? `You earned ${coins} coins.`;
};

export const sendCoinNotification = async ({
  userId,
  title,
  description,
  reference,
}: {
  userId: string;
  title: string;
  description: string;
  reference?: TCoinNotificationReference;
}) =>
  sendNotificationViaQueue({
    userId,
    channel: 'both',
    title,
    message: description,
    data: {
      modelType: NOTIFICATION_MODEL_TYPE.Coin,
      reference: reference?.toString(),
    },
  });

export const sendCoinEarnedNotification = (
  userId: string,
  coins: number,
  action: (typeof COIN_EARNING_ACTION)[keyof typeof COIN_EARNING_ACTION],
  reference?: TCoinNotificationReference
) =>
  sendCoinNotification({
    userId,
    title: `You earned ${coins} coins`,
    description: getEarnedCoinMessage(action, coins),
    reference,
  });

export const sendCoinRedeemedNotification = (
  userId: string,
  coins: number,
  reference?: TCoinNotificationReference
) =>
  sendCoinNotification({
    userId,
    title: `You used ${coins} coins`,
    description: `You used ${coins} coins on your order.`,
    reference,
  });

export const sendCoinExpiredNotification = (
  userId: string,
  coins: number,
  reference?: TCoinNotificationReference
) =>
  sendCoinNotification({
    userId,
    title: `${coins} coins expired`,
    description: `${coins} coins expired from your account.`,
    reference,
  });

export const sendCoinReminderNotification = (
  userId: string,
  coins: number,
  days: 30 | 50
) =>
  sendCoinNotification({
    userId,
    title: days === 30 ? `${coins} coins are waiting` : `${coins} coins expire soon`,
    description:
      days === 30
        ? `You have ${coins} coins waiting in your account.`
        : `Your ${coins} coins expire in 10 days!`,
  });

