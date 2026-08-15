import { Types } from 'mongoose';

import { COIN_EARNING_ACTION } from '@/app/modules/coin/coin.constant';
import { NOTIFICATION_MODEL_TYPE } from '@/app/modules/notification/notification.constant';
import { sendNotificationViaQueue } from '@/app/utils/notification-queue.service';

type TCoinNotificationReference = string | Types.ObjectId | null | undefined;

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

