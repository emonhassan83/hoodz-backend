import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { USER_ROLE, USER_STATUS } from '@/app/modules/user/user.constant';
import { User } from '@/app/modules/user/user.model';
import {
  VOUCHER_DISCOUNT_TYPE,
  VOUCHER_STATUS,
  VOUCHER_TYPE,
} from '@/app/modules/voucher/voucher.constant';
import { IVoucher } from '@/app/modules/voucher/voucher.interface';
import { Voucher } from '@/app/modules/voucher/voucher.model';
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
