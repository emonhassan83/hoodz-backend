import { HttpStatusCode } from 'axios';
import { ClientSession, Types } from 'mongoose';

import {
  COIN_EXPIRY_DAYS,
  COIN_EXPIRY_WARNING_DAYS,
  COIN_INACTIVITY_REMINDER_DAYS,
  COIN_PURCHASE_SPEND_UNIT_EGP,
  COIN_REDEMPTION_MAX_SUBTOTAL_PERCENT,
  COIN_REDEMPTION_MIN_BALANCE,
  COIN_REDEMPTION_MIN_BASKET_SUBTOTAL_EGP,
  COIN_REVIEW_MONTHLY_CAP,
  COIN_REWARD_AMOUNT,
  DEFAULT_COINS_PER_EGP,
} from '@/app/constant';
import ApiError from '@/app/errors/ApiError';
import {
  COIN_EARNING_ACTION,
  COIN_REFERENCE_TYPE,
  COIN_TRANSACTION_STATUS,
  COIN_TRANSACTION_TYPE,
} from '@/app/modules/coin/coin.constant';
import { TCoinEarningAction } from '@/app/modules/coin/coin.interface';
import {
  addDays,
  expireOldCoins,
  getActiveCoinStats,
  getMonthlyEarnCount,
  getOrCreateAccount,
  sendCoinEarnedNotification,
  sendCoinExpiredNotification,
  sendCoinRedeemedNotification,
  sendCoinReminderNotification,
  syncAccountBalance,
  toObjectId,
} from '@/app/modules/coin/coin.helpers';
import { CoinAccount, CoinTransaction } from '@/app/modules/coin/coin.model';
import { TCoinReferenceType, TReferenceId } from '@/app/modules/coin/coin.types';
import { PAYMENT_STATUS } from '@/app/modules/orders/orders.constant';
import { Orders } from '@/app/modules/orders/orders.model';
import { SettingService } from '@/app/modules/settings/settings.services';
import { User } from '@/app/modules/user/user.model';

const getCoinsPerEgp = async () => {
  const platformSettings = await SettingService.getAdminSettings();
  const coinsPerEgp = Number(platformSettings.coinsPerEgp);
  return Number.isFinite(coinsPerEgp) && coinsPerEgp > 0
    ? coinsPerEgp
    : DEFAULT_COINS_PER_EGP;
};

const getSummary = async (userId: string) => {
  await expireOldCoins(userId);
  const [account, stats, coinsPerEgp] = await Promise.all([
    getOrCreateAccount(userId),
    getActiveCoinStats(userId),
    getCoinsPerEgp(),
  ]);

  if (account && account.balance !== stats.balance) {
    account.balance = stats.balance;
    await account.save();
  }

  return {
    balance: stats.balance,
    lastActivityAt: account?.lastActivityAt ?? null,
    nextExpiryAt: stats.nextExpiryAt,
    expiringCoins: stats.expiringCoins,
    redemption: {
      coinsPerEgp,
      coinValueEgp: Number((1 / coinsPerEgp).toFixed(4)),
      minBalance: COIN_REDEMPTION_MIN_BALANCE,
      minBasketSubtotal: COIN_REDEMPTION_MIN_BASKET_SUBTOTAL_EGP,
      maxCheckoutPercent: COIN_REDEMPTION_MAX_SUBTOTAL_PERCENT,
    },
  };
};

const addCoins = async (
  userId: string,
  coins: number,
  action: TCoinEarningAction,
  referenceType: TCoinReferenceType,
  reference: TReferenceId,
  session?: ClientSession
) => {
  if (coins <= 0) return null;

  const referenceObjectId = toObjectId(reference);
  const existingTransaction = await CoinTransaction.findOne({
    user: userId,
    type: COIN_TRANSACTION_TYPE.earn,
    action,
    referenceType,
    reference: referenceObjectId,
  }).session(session ?? null);

  if (existingTransaction) {
    return getOrCreateAccount(userId, session);
  }

  const now = new Date();
  const expiresAt = addDays(now, COIN_EXPIRY_DAYS);
  const [transaction] = await CoinTransaction.create(
    [
      {
        user: userId,
        type: COIN_TRANSACTION_TYPE.earn,
        action,
        coins,
        remainingCoins: coins,
        expiresAt,
        status: COIN_TRANSACTION_STATUS.active,
        referenceType,
        reference: referenceObjectId,
      },
    ],
    { session }
  );

  const account = await getOrCreateAccount(userId, session);
  account.balance += coins;
  account.lastActivityAt = now;
  account.inactiveReminderSentAt = null;
  await account.save({ session });

  if (!session) {
    await sendCoinEarnedNotification(
      userId,
      coins,
      action,
      transaction._id
    ).catch((error) => {
      console.warn('[Coin] Failed to queue earn notification', error);
    });
  }

  return account;
};

const addWelcomeBonus = (userId: string, session?: ClientSession) =>
  addCoins(
    userId,
    COIN_REWARD_AMOUNT.account_creation,
    COIN_EARNING_ACTION.account_creation,
    COIN_REFERENCE_TYPE.user,
    userId,
    session
  );

const addProfileCompletionBonus = (userId: string, session?: ClientSession) =>
  addCoins(
    userId,
    COIN_REWARD_AMOUNT.profile_completion,
    COIN_EARNING_ACTION.profile_completion,
    COIN_REFERENCE_TYPE.user,
    userId,
    session
  );

const addReviewBonus = async (
  userId: string,
  reviewId: TReferenceId,
  hasPhotoOrOutfit: boolean
) => {
  const action = hasPhotoOrOutfit
    ? COIN_EARNING_ACTION.photo_review
    : COIN_EARNING_ACTION.product_review;
  const monthlyCount = await getMonthlyEarnCount(userId, action);

  if (monthlyCount >= COIN_REVIEW_MONTHLY_CAP) return null;

  return addCoins(
    userId,
    hasPhotoOrOutfit
      ? COIN_REWARD_AMOUNT.photo_review
      : COIN_REWARD_AMOUNT.product_review,
    action,
    COIN_REFERENCE_TYPE.review,
    reviewId
  );
};

const addPurchaseBonus = async (
  userId: string,
  orderId: TReferenceId,
  paidSubtotal: number
) => {
  const coins = Math.floor(paidSubtotal / COIN_PURCHASE_SPEND_UNIT_EGP);
  return addCoins(
    userId,
    coins,
    COIN_EARNING_ACTION.purchase,
    COIN_REFERENCE_TYPE.order,
    orderId
  );
};

const getRedemptionPreview = async (
  traceId: string,
  userId: string,
  requestedCoins: number,
  basketSubtotal: number,
  eligibleSubtotal = basketSubtotal
) => {
  if (!requestedCoins) {
    return { redeemCoins: 0, coinDiscount: 0 };
  }

  if (requestedCoins > 0 && requestedCoins < COIN_REDEMPTION_MIN_BALANCE) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      `Minimum ${COIN_REDEMPTION_MIN_BALANCE} coins must be redeemed`,
      traceId
    );
  }

  await expireOldCoins(userId);
  const [stats, coinsPerEgp] = await Promise.all([
    getActiveCoinStats(userId),
    getCoinsPerEgp(),
  ]);
  const availableCoins = stats.balance;
  const coinValueEgp = 1 / coinsPerEgp;
  const maxCoinsByBasket = Math.floor(
    (basketSubtotal * COIN_REDEMPTION_MAX_SUBTOTAL_PERCENT) / 100 / coinValueEgp
  );
  const maxCoinsByEligibleSubtotal = Math.floor(eligibleSubtotal / coinValueEgp);
  const maxRedeemableCoins = Math.min(
    availableCoins,
    maxCoinsByBasket,
    maxCoinsByEligibleSubtotal
  );

  if (requestedCoins > availableCoins) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      `You have ${availableCoins} coins. You cannot redeem ${requestedCoins} coins`,
      traceId
    );
  }

  if (basketSubtotal < COIN_REDEMPTION_MIN_BASKET_SUBTOTAL_EGP) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      `Minimum basket subtotal is EGP ${COIN_REDEMPTION_MIN_BASKET_SUBTOTAL_EGP}`,
      traceId
    );
  }

  if (eligibleSubtotal <= 0) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Coins cannot be redeemed on discounted items',
      traceId
    );
  }

  if (requestedCoins > maxCoinsByBasket) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      `You can redeem up to ${COIN_REDEMPTION_MAX_SUBTOTAL_PERCENT}% of the product basket (max ${maxCoinsByBasket} coins)`,
      traceId
    );
  }

  if (requestedCoins > maxRedeemableCoins) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      `You can redeem up to ${maxRedeemableCoins} coins for this basket`,
      traceId
    );
  }

  return {
    redeemCoins: requestedCoins,
    coinDiscount: Number((requestedCoins * coinValueEgp).toFixed(2)),
  };
};

const redeemCoins = async (
  traceId: string,
  userId: string,
  coins: number,
  referenceType: TCoinReferenceType,
  reference: TReferenceId,
  session?: ClientSession
) => {
  if (!coins) return null;

  const referenceObjectId = toObjectId(reference);
  const existingTransaction = await CoinTransaction.findOne({
    user: userId,
    type: COIN_TRANSACTION_TYPE.redeem,
    referenceType,
    reference: referenceObjectId,
  }).session(session ?? null);

  if (existingTransaction) return existingTransaction;

  await expireOldCoins(userId, new Date(), session);
  const earnTransactions = await CoinTransaction.find({
    user: userId,
    status: COIN_TRANSACTION_STATUS.active,
    remainingCoins: { $gt: 0 },
    expiresAt: { $gt: new Date() },
  })
    .sort({ expiresAt: 1, createdAt: 1 })
    .session(session ?? null);

  const availableCoins = earnTransactions.reduce(
    (total, transaction) => total + transaction.remainingCoins,
    0
  );

  if (availableCoins < coins) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Not enough active coins to redeem', traceId);
  }

  let coinsToRedeem = coins;
  for (const transaction of earnTransactions) {
    if (coinsToRedeem <= 0) break;

    const usedCoins = Math.min(transaction.remainingCoins, coinsToRedeem);
    transaction.remainingCoins -= usedCoins;
    coinsToRedeem -= usedCoins;

    if (transaction.remainingCoins === 0) {
      transaction.status = COIN_TRANSACTION_STATUS.used;
    }

    await transaction.save({ session });
  }

  const [redeemTransaction] = await CoinTransaction.create(
    [
      {
        user: userId,
        type: COIN_TRANSACTION_TYPE.redeem,
        coins,
        remainingCoins: 0,
        expiresAt: null,
        status: COIN_TRANSACTION_STATUS.used,
        referenceType,
        reference: referenceObjectId,
      },
    ],
    { session }
  );

  const account = await getOrCreateAccount(userId, session);
  account.balance = Math.max(0, account.balance - coins);
  account.lastActivityAt = new Date();
  account.inactiveReminderSentAt = null;
  await account.save({ session });

  if (!session) {
    await sendCoinRedeemedNotification(
      userId,
      coins,
      redeemTransaction._id
    ).catch((error) => {
      console.warn('[Coin] Failed to queue redeem notification', error);
    });
  }

  return redeemTransaction;
};

const sendRedemptionNotification = (
  userId: string,
  coins: number,
  reference?: TReferenceId
) =>
  sendCoinRedeemedNotification(userId, coins, reference).catch((error) => {
    console.warn('[Coin] Failed to queue redeem notification', error);
  });

const addReferralInviteeBonus = (userId: string) =>
  addCoins(
    userId,
    COIN_REWARD_AMOUNT.referral_invitee,
    COIN_EARNING_ACTION.referral_invitee,
    COIN_REFERENCE_TYPE.user,
    userId
  );

const addReferralInviterBonus = (inviterId: string, inviteeId: string) =>
  addCoins(
    inviterId,
    COIN_REWARD_AMOUNT.referral_inviter,
    COIN_EARNING_ACTION.referral_inviter,
    COIN_REFERENCE_TYPE.user,
    inviteeId
  );

const processReferralRewards = async (
  userId: string,
  checkoutOrders: { amount: number; transactionId?: string | null }[]
) => {
  const user = await User.findById(userId).select('referredBy').lean();
  if (!user?.referredBy) return;

  const transactionIds = [
    ...new Set(
      checkoutOrders
        .map((order) => order.transactionId)
        .filter((transactionId): transactionId is string => Boolean(transactionId))
    ),
  ];
  const relatedOrders = transactionIds.length
    ? await Orders.find({
        user: userId,
        isDeleted: false,
        paymentStatus: PAYMENT_STATUS.paid,
        transactionId: { $in: transactionIds },
      })
        .select('amount')
        .lean()
    : checkoutOrders;
  const checkoutSubtotal = relatedOrders.reduce(
    (total, order) => total + (order.amount ?? 0),
    0
  );

  if (checkoutSubtotal < COIN_REDEMPTION_MIN_BASKET_SUBTOTAL_EGP) return;

  await addReferralInviteeBonus(userId);
  await addReferralInviterBonus(user.referredBy.toString(), userId);
};

const processPaidOrderRewards = async (orderIds: TReferenceId[]) => {
  const uniqueOrderIds = [
    ...new Set(orderIds.map((orderId) => orderId.toString()).filter(Boolean)),
  ];
  if (!uniqueOrderIds.length) return;

  const orders = await Orders.find({
    _id: { $in: uniqueOrderIds },
    isDeleted: false,
    paymentStatus: PAYMENT_STATUS.paid,
  }).lean();

  for (const order of orders) {
    if (!order.user) continue;
    await addPurchaseBonus(
      order.user.toString(),
      order._id,
      Math.max(0, order.amount - (order.coinDiscount ?? 0))
    );
  }

  const ordersByUser = new Map<string, typeof orders>();
  for (const order of orders) {
    if (!order.user) continue;
    const userId = order.user.toString();
    const existingOrders = ordersByUser.get(userId) ?? [];
    ordersByUser.set(userId, [...existingOrders, order]);
  }

  for (const [userId, userOrders] of ordersByUser.entries()) {
    await processReferralRewards(userId, userOrders);
  }
};

const sendInactiveCoinReminders = async (now = new Date()) => {
  const cutoff = addDays(now, -COIN_INACTIVITY_REMINDER_DAYS);
  const accounts = await CoinAccount.find({
    balance: { $gt: 0 },
    inactiveReminderSentAt: null,
    $or: [
      { lastActivityAt: { $ne: null, $lte: cutoff } },
      { lastActivityAt: null, createdAt: { $lte: cutoff } },
    ],
  }).lean();

  for (const account of accounts) {
    await sendCoinReminderNotification(
      account.user.toString(),
      account.balance,
      30
    ).catch((error) => {
      console.warn('[Coin] Failed to queue inactivity reminder', error);
    });
    await CoinAccount.updateOne(
      { _id: account._id },
      { inactiveReminderSentAt: now }
    );
  }

  return { notifiedUsers: accounts.length };
};

const sendExpiryWarnings = async (now = new Date()) => {
  const warningWindowEnd = addDays(now, COIN_EXPIRY_WARNING_DAYS);
  const expiringTransactions = await CoinTransaction.aggregate<{
    _id: Types.ObjectId;
    coins: number;
    transactionIds: Types.ObjectId[];
  }>([
    {
      $match: {
        status: COIN_TRANSACTION_STATUS.active,
        remainingCoins: { $gt: 0 },
        expiryWarningSentAt: null,
        expiresAt: { $gt: now, $lte: warningWindowEnd },
      },
    },
    {
      $group: {
        _id: '$user',
        coins: { $sum: '$remainingCoins' },
        transactionIds: { $push: '$_id' },
      },
    },
  ]);

  for (const group of expiringTransactions) {
    await sendCoinReminderNotification(
      group._id.toString(),
      group.coins,
      50
    ).catch((error) => {
      console.warn('[Coin] Failed to queue expiry warning', error);
    });
    await CoinTransaction.updateMany(
      { _id: { $in: group.transactionIds } },
      { expiryWarningSentAt: now }
    );
  }

  return { notifiedUsers: expiringTransactions.length };
};

const expireDueCoins = async (now = new Date()) => {
  const dueTransactions = await CoinTransaction.find({
    status: COIN_TRANSACTION_STATUS.active,
    remainingCoins: { $gt: 0 },
    expiresAt: { $lte: now },
  })
    .select('user remainingCoins')
    .lean();

  if (!dueTransactions.length) {
    return { expiredUsers: 0, expiredCoins: 0 };
  }

  const expiredByUser = new Map<string, number>();
  for (const transaction of dueTransactions) {
    const userId = transaction.user.toString();
    expiredByUser.set(
      userId,
      (expiredByUser.get(userId) ?? 0) + transaction.remainingCoins
    );
  }

  await CoinTransaction.updateMany(
    { _id: { $in: dueTransactions.map((transaction) => transaction._id) } },
    {
      status: COIN_TRANSACTION_STATUS.expired,
      remainingCoins: 0,
    }
  );

  for (const [userId, expiredCoins] of expiredByUser.entries()) {
    await syncAccountBalance(userId, now);
    await sendCoinExpiredNotification(userId, expiredCoins).catch((error) => {
      console.warn('[Coin] Failed to queue expiry notification', error);
    });
  }

  return {
    expiredUsers: expiredByUser.size,
    expiredCoins: [...expiredByUser.values()].reduce(
      (total, coins) => total + coins,
      0
    ),
  };
};

export const CoinService = {
  getSummary,
  addCoins,
  addWelcomeBonus,
  addProfileCompletionBonus,
  addReviewBonus,
  addPurchaseBonus,
  getRedemptionPreview,
  redeemCoins,
  sendRedemptionNotification,
  processPaidOrderRewards,
  sendInactiveCoinReminders,
  sendExpiryWarnings,
  expireDueCoins,
};
