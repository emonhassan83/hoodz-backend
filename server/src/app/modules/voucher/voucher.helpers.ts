import { HttpStatusCode } from 'axios';
import { ClientSession, Types } from 'mongoose';

import ApiError from '@/app/errors/ApiError';
import { Orders } from '@/app/modules/orders/orders.model';
import { USER_ROLE, USER_STATUS } from '@/app/modules/user/user.constant';
import { User } from '@/app/modules/user/user.model';
import {
  VOUCHER_DISCOUNT_TYPE,
  VOUCHER_STATUS,
  VOUCHER_TYPE,
} from '@/app/modules/voucher/voucher.constant';
import { IVoucher } from '@/app/modules/voucher/voucher.interface';
import { Voucher } from '@/app/modules/voucher/voucher.model';
import { VoucherLog } from '@/app/modules/voucher/voucherLog.model';
import {
  TUpdateVoucherPayload,
  TVoucherPayload,
  TVoucherRequester,
} from '@/app/modules/voucher/voucher.types';

/** Normalizes voucher codes before persistence and lookup. */
export const normalizeVoucherCode = (code: string) => code.trim().toUpperCase();

/** Throws when voucher does not exist. */
export const assertVoucherExists = (
  voucher: unknown,
  traceId: string
) => {
  if (!voucher) {
    throw new ApiError(HttpStatusCode.NotFound, 'Voucher not found', traceId);
  }
};

/** Ensures a code is unique across non-deleted vouchers. */
export const assertVoucherCodeAvailable = async (
  traceId: string,
  code: string,
  voucherId?: string
) => {
  const voucher = await Voucher.findOne({
    code: normalizeVoucherCode(code),
    isDeleted: false,
    ...(voucherId ? { _id: { $ne: voucherId } } : {}),
  });
  if (voucher) {
    throw new ApiError(HttpStatusCode.Conflict, 'Voucher code already exists', traceId);
  }
};

/** Validates vendor/user references required by voucher category. */
export const assertVoucherReferences = async (
  traceId: string,
  payload: Pick<TVoucherPayload, 'voucherType' | 'shop' | 'user'>
) => {
  if (payload.voucherType === VOUCHER_TYPE.shop) {
    if (!payload.shop) {
      throw new ApiError(HttpStatusCode.BadRequest, 'Shop is required for shopwise voucher', traceId);
    }

    const shop = await User.findOne({
      _id: payload.shop,
      role: USER_ROLE.vendor,
      status: USER_STATUS.active,
      isDeleted: false,
    });
    if (!shop) {
      throw new ApiError(HttpStatusCode.BadRequest, 'Valid active vendor shop is required', traceId);
    }
    return;
  }

  if (payload.voucherType === VOUCHER_TYPE.compensation) {
    if (!payload.user) {
      throw new ApiError(HttpStatusCode.BadRequest, 'User is required for compension voucher', traceId);
    }

    const user = await User.findOne({
      _id: payload.user,
      role: USER_ROLE.user,
      isDeleted: false,
    });
    if (!user) {
      throw new ApiError(HttpStatusCode.BadRequest, 'Valid user is required', traceId);
    }
    return;
  }

  if (payload.voucherType === VOUCHER_TYPE.global && (payload.shop || payload.user)) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Global voucher cannot have shop or user reference',
      traceId
    );
  }
};

/** Checks discount rules that depend on discount type. */
export const assertVoucherDiscountRules = (
  traceId: string,
  payload: Pick<TVoucherPayload, 'discountType' | 'discountValue' | 'giftDetails'>
) => {
  if (
    payload.discountType === VOUCHER_DISCOUNT_TYPE.percentage &&
    (payload.discountValue <= 0 || payload.discountValue > 100)
  ) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Percentage discount must be between 1 and 100',
      traceId
    );
  }

  if (
    payload.discountType !== VOUCHER_DISCOUNT_TYPE.gift &&
    payload.discountValue <= 0
  ) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Discount value must be greater than 0', traceId);
  }

  if (payload.discountType === VOUCHER_DISCOUNT_TYPE.gift) {
    if (!payload.giftDetails?.name || !payload.giftDetails?.bannerImage?.length) {
      throw new ApiError(
        HttpStatusCode.BadRequest,
        'Gift name and banner image are required for gift voucher',
        traceId
      );
    }
  }
};

/** Checks expiry date is still in the future for active vouchers. */
export const assertFutureExpiryDate = (traceId: string, expiryDate: string | Date) => {
  if (new Date(expiryDate).getTime() <= Date.now()) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Expiry date must be in the future', traceId);
  }
};

/** Restricts mutations by requester role and voucher category. */
export const assertVoucherMutationAccess = (
  traceId: string,
  requester: TVoucherRequester,
  voucher: Pick<IVoucher, 'voucherType' | 'shop' | 'user'> | TVoucherPayload
) => {
  if (requester.role === USER_ROLE.admin) return;

  if (
    requester.role === USER_ROLE.vendor &&
    voucher.voucherType === VOUCHER_TYPE.shop &&
    voucher.shop?.toString() === requester.userId
  ) {
    return;
  }

  if (
    requester.role === USER_ROLE.agent &&
    (voucher.voucherType === VOUCHER_TYPE.global ||
      voucher.voucherType === VOUCHER_TYPE.compensation)
  ) {
    return;
  }

  throw new ApiError(
    HttpStatusCode.Forbidden,
    'You are not allowed to manage this voucher',
    traceId
  );
};

/** Builds active voucher base query that hides expired/deleted rows. */
export const activeVoucherFilter = () => ({
  status: VOUCHER_STATUS.active,
  expiryDate: { $gt: new Date() },
  isDeleted: false,
});

/** Returns an active, non-expired voucher by code or throws. */
export const getActiveVoucherByCodeOrThrow = async (
  traceId: string,
  code: string
) => {
  const voucher = await Voucher.findOne({
    code: normalizeVoucherCode(code),
    ...activeVoucherFilter(),
  });
  if (!voucher) {
    throw new ApiError(HttpStatusCode.NotFound, 'Voucher code is invalid or expired', traceId);
  }

  return voucher;
};

/** Calculates money discount for a voucher against an eligible subtotal. */
export const calculateVoucherDiscountAmount = (
  voucher: Pick<IVoucher, 'discountType' | 'discountValue'>,
  eligibleAmount: number
) => {
  if (eligibleAmount <= 0) return 0;
  if (voucher.discountType === VOUCHER_DISCOUNT_TYPE.gift) return 0;

  if (voucher.discountType === VOUCHER_DISCOUNT_TYPE.fixed) {
    return Number(Math.min(voucher.discountValue, eligibleAmount).toFixed(2));
  }

  const percentDiscount = (eligibleAmount * voucher.discountValue) / 100;
  return Number(Math.min(percentDiscount, eligibleAmount).toFixed(2));
};

/** Shapes gift payload for checkout and order documents. */
export const formatCheckoutGiftDetails = (voucher: IVoucher) => {
  if (voucher.discountType !== VOUCHER_DISCOUNT_TYPE.gift) return null;

  return {
    name: voucher.giftDetails?.name ?? null,
    nameArabic: voucher.giftDetails?.nameArabic ?? null,
    bannerImage: voucher.giftDetails?.bannerImage ?? [],
    description: voucher.giftDetails?.description ?? null,
    descriptionArabic: voucher.giftDetails?.descriptionArabic ?? null,
  };
};

/** Normalizes payload references by voucher type. */
export const normalizeVoucherPayload = <T extends TVoucherPayload | TUpdateVoucherPayload>(
  payload: T
) => {
  const normalized = { ...payload } as T & Record<string, unknown>;
  if (payload.code) normalized.code = normalizeVoucherCode(payload.code);
  if (payload.voucherType === VOUCHER_TYPE.global) {
    normalized.shop = null;
    normalized.user = null;
  }
  if (payload.voucherType === VOUCHER_TYPE.shop) normalized.user = null;
  if (payload.voucherType === VOUCHER_TYPE.compensation) normalized.shop = null;
  return normalized as T;
};

export const voucherListSelect =
  '_id code title titleArabic description descriptionArabic voucherType discountType discountValue giftDetails minSpend expiryDate status';

/** Shapes voucher list cards for frontend. */
export const formatVoucherListItem = (
  voucher: Record<string, any>,
  usage?: { hasUsed: boolean; useAt: Date | null }
) => {
  const item: Record<string, unknown> = {
    _id: voucher._id,
    code: voucher.code,
    title: voucher.title,
    titleArabic: voucher.titleArabic ?? null,
    description: voucher.description ?? null,
    descriptionArabic: voucher.descriptionArabic ?? null,
    voucherType: voucher.voucherType,
    discountType: voucher.discountType,
    discountValue: voucher.discountValue ?? 0,
    giftDetails: {
      name: voucher.giftDetails?.name ?? null,
      nameArabic: voucher.giftDetails?.nameArabic ?? null,
      bannerImage: voucher.giftDetails?.bannerImage ?? [],
      description: voucher.giftDetails?.description ?? null,
      descriptionArabic: voucher.giftDetails?.descriptionArabic ?? null,
    },
    minSpend: voucher.minSpend ?? 0,
    expiryDate: voucher.expiryDate,
    status: voucher.status,
  };
  if (usage) {
    item.hasUsed = usage.hasUsed;
    item.useAt = usage.useAt;
  }
  return item;
};

export const formatVoucherListItems = (
  vouchers: Record<string, any>[],
  usageByVoucherId?: Map<string, Date | null>
) =>
  vouchers.map((voucher) => {
    if (!usageByVoucherId) return formatVoucherListItem(voucher);

    const voucherId = voucher._id.toString();
    const hasUsed = usageByVoucherId.has(voucherId);
    return formatVoucherListItem(voucher, {
      hasUsed,
      useAt: hasUsed ? usageByVoucherId.get(voucherId) ?? null : null,
    });
  });

/** Unused vouchers first, then used vouchers. */
export const sortVouchersByHasUsed = <T extends { hasUsed?: boolean }>(
  vouchers: T[]
) =>
  [...vouchers].sort((left, right) => {
    const leftUsed = left.hasUsed ? 1 : 0;
    const rightUsed = right.hasUsed ? 1 : 0;
    return leftUsed - rightUsed;
  });

/** Filters list items by hasUsed query when provided. */
export const filterVouchersByHasUsed = <T extends { hasUsed?: boolean }>(
  vouchers: T[],
  hasUsedQuery: unknown
) => {
  if (hasUsedQuery === undefined || hasUsedQuery === null || hasUsedQuery === '') {
    return vouchers;
  }

  const raw = String(hasUsedQuery).toLowerCase();
  if (raw === 'true') return vouchers.filter((voucher) => voucher.hasUsed === true);
  if (raw === 'false') return vouchers.filter((voucher) => voucher.hasUsed === false);
  return vouchers;
};

/** Returns voucherId -> VoucherLog.createdAt (or null when only order history exists). */
export const getVoucherUsageMap = async (
  userId: string | undefined,
  voucherIds: Array<string | Types.ObjectId>
) => {
  const usage = new Map<string, Date | null>();
  if (!userId || voucherIds.length === 0) return usage;

  const [logs, orders] = await Promise.all([
    VoucherLog.find({
      user: userId,
      voucher: { $in: voucherIds },
    })
      .select('voucher createdAt')
      .lean(),
    Orders.find({
      user: userId,
      voucher: { $in: voucherIds },
    })
      .select('voucher createdAt')
      .lean(),
  ]);

  for (const order of orders) {
    const id = order.voucher?.toString();
    if (id && !usage.has(id)) usage.set(id, null);
  }

  for (const log of logs) {
    const id = log.voucher?.toString();
    if (id) usage.set(id, log.createdAt ?? null);
  }

  return usage;
};

/** True when this user already consumed the voucher. */
export const hasUserUsedVoucher = async (
  userId: string | undefined,
  voucherId: string | Types.ObjectId
) => {
  if (!userId) return false;

  const [log, order] = await Promise.all([
    VoucherLog.exists({ user: userId, voucher: voucherId }),
    Orders.exists({ user: userId, voucher: voucherId }),
  ]);

  return Boolean(log || order);
};

/** Returns usage flag and VoucherLog.createdAt for one voucher. */
export const getVoucherUsageForUser = async (
  userId: string | undefined,
  voucherId: string | Types.ObjectId
) => {
  if (!userId) return { hasUsed: false, useAt: null as Date | null };

  const log = await VoucherLog.findOne({ user: userId, voucher: voucherId })
    .select('createdAt')
    .lean();
  if (log) return { hasUsed: true, useAt: log.createdAt ?? null };

  const order = await Orders.exists({ user: userId, voucher: voucherId });
  return { hasUsed: Boolean(order), useAt: null };
};

/** Blocks checkout when the same user tries the same voucher again. */
export const assertVoucherNotUsedByUser = async (
  traceId: string,
  userId: string,
  voucherId: string | Types.ObjectId
) => {
  if (await hasUserUsedVoucher(userId, voucherId)) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'You have already used this voucher',
      traceId
    );
  }
};

/** Stores a user-voucher usage row inside the order transaction. */
export const createVoucherLog = async (
  userId: string,
  voucherId: string | Types.ObjectId,
  session: ClientSession
) => {
  await VoucherLog.create([{ user: userId, voucher: voucherId }], { session });
};
