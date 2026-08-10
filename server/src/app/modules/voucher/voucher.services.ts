import { HttpStatusCode } from 'axios';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import {
  VOUCHER_STATUS,
  VOUCHER_TYPE,
} from '@/app/modules/voucher/voucher.constant';
import {
  activeVoucherFilter,
  assertFutureExpiryDate,
  assertVoucherCodeAvailable,
  assertVoucherDiscountRules,
  assertVoucherExists,
  assertVoucherMutationAccess,
  assertVoucherReferences,
  normalizeVoucherPayload,
} from '@/app/modules/voucher/voucher.helpers';
import { Voucher } from '@/app/modules/voucher/voucher.model';
import {
  TUpdateVoucherPayload,
  TUpdateVoucherStatusPayload,
  TVoucherPayload,
  TVoucherRequester,
} from '@/app/modules/voucher/voucher.types';

const voucherPopulate = [
  { path: 'shop', select: 'name email phone profileAvatar coverPhoto avgRating ratingCount' },
  { path: 'user', select: 'name email phone profileAvatar' },
];

/** Creates one voucher after role/category validation. */
const addVouture = async (
  traceId: string,
  requester: TVoucherRequester,
  payload: TVoucherPayload
) => {
  const normalizedPayload = normalizeVoucherPayload(payload);
  assertVoucherMutationAccess(traceId, requester, normalizedPayload);
  assertFutureExpiryDate(traceId, normalizedPayload.expiryDate);
  assertVoucherDiscountRules(traceId, normalizedPayload);
  await assertVoucherCodeAvailable(traceId, normalizedPayload.code);
  await assertVoucherReferences(traceId, normalizedPayload);

  const voucher = await Voucher.create(normalizedPayload);
  return Voucher.findById(voucher._id).populate(voucherPopulate).select('-__v');
};

/** Returns platform-wide active vouchers. */
const getGlobalVoutures = async (query: Record<string, unknown>) => {
  const voucherQuery = new QueryBuilder(
    Voucher.find({
      ...activeVoucherFilter(),
      voucherType: VOUCHER_TYPE.global,
    })
      .populate(voucherPopulate)
      .select('-__v')
      .lean(),
    query
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const [data, meta] = await Promise.all([
    voucherQuery.modelQuery,
    voucherQuery.countTotal(),
  ]);

  return { meta, data };
};

/** Returns active vouchers for one vendor shop. */
const getShopwiseVoutures = async (
  vendorId: string,
  query: Record<string, unknown>
) => {
  const voucherQuery = new QueryBuilder(
    Voucher.find({
      ...activeVoucherFilter(),
      voucherType: VOUCHER_TYPE.shop,
      shop: vendorId,
    })
      .populate(voucherPopulate)
      .select('-__v')
      .lean(),
    query
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const [data, meta] = await Promise.all([
    voucherQuery.modelQuery,
    voucherQuery.countTotal(),
  ]);

  return { meta, data };
};

/** Returns compensation vouchers for the user, or all for admin/agent. */
const getCompensionVoutures = async (
  requester: TVoucherRequester,
  query: Record<string, unknown>
) => {
  const filter =
    requester.role === USER_ROLE.admin || requester.role === USER_ROLE.agent
      ? { voucherType: VOUCHER_TYPE.compensation, isDeleted: false }
      : {
          ...activeVoucherFilter(),
          voucherType: VOUCHER_TYPE.compensation,
          user: requester.userId,
        };

  const voucherQuery = new QueryBuilder(
    Voucher.find(filter).populate(voucherPopulate).select('-__v').lean(),
    query
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const [data, meta] = await Promise.all([
    voucherQuery.modelQuery,
    voucherQuery.countTotal(),
  ]);

  return { meta, data };
};

/** Returns one voucher if requester can view it. */
const getAVouture = async (
  traceId: string,
  voucherId: string,
  requester: TVoucherRequester
) => {
  const voucher = await Voucher.findOne({ _id: voucherId, isDeleted: false })
    .populate(voucherPopulate)
    .select('-__v');
  assertVoucherExists(voucher, traceId);

  if (
    requester.role === USER_ROLE.user &&
    voucher!.voucherType === VOUCHER_TYPE.compensation &&
    voucher!.user?.toString() !== requester.userId
  ) {
    throw new ApiError(HttpStatusCode.Forbidden, 'You are not allowed to view this voucher', traceId);
  }

  return voucher;
};

/** Updates one voucher after ownership and business-rule checks. */
const updateAVouture = async (
  traceId: string,
  voucherId: string,
  requester: TVoucherRequester,
  payload: TUpdateVoucherPayload
) => {
  const voucher = await Voucher.findOne({ _id: voucherId, isDeleted: false });
  assertVoucherExists(voucher, traceId);
  assertVoucherMutationAccess(traceId, requester, voucher!);

  const nextPayload = normalizeVoucherPayload({
    ...voucher!.toObject(),
    ...payload,
  } as TVoucherPayload);

  assertVoucherMutationAccess(traceId, requester, nextPayload);
  if (payload.expiryDate) assertFutureExpiryDate(traceId, payload.expiryDate);
  assertVoucherDiscountRules(traceId, nextPayload);
  if (payload.code) {
    await assertVoucherCodeAvailable(traceId, payload.code, voucherId);
  }
  await assertVoucherReferences(traceId, nextPayload);

  const updatedVoucher = await Voucher.findByIdAndUpdate(voucherId, nextPayload, {
    returnDocument: 'after',
  })
    .populate(voucherPopulate)
    .select('-__v');

  return updatedVoucher;
};

/** Updates one voucher status. */
const updateVoutureStatus = async (
  traceId: string,
  voucherId: string,
  requester: TVoucherRequester,
  payload: TUpdateVoucherStatusPayload
) => {
  const voucher = await Voucher.findOne({ _id: voucherId, isDeleted: false });
  assertVoucherExists(voucher, traceId);
  assertVoucherMutationAccess(traceId, requester, voucher!);

  if (
    payload.status === VOUCHER_STATUS.active &&
    voucher!.expiryDate.getTime() <= Date.now()
  ) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Expired voucher cannot be activated', traceId);
  }

  return Voucher.findByIdAndUpdate(
    voucherId,
    { status: payload.status },
    { returnDocument: 'after' }
  )
    .populate(voucherPopulate)
    .select('-__v');
};

/** Soft deletes one voucher. */
const removeVouture = async (
  traceId: string,
  voucherId: string,
  requester: TVoucherRequester
) => {
  const voucher = await Voucher.findOne({ _id: voucherId, isDeleted: false });
  assertVoucherExists(voucher, traceId);
  assertVoucherMutationAccess(traceId, requester, voucher!);

  return Voucher.findByIdAndUpdate(
    voucherId,
    { isDeleted: true },
    { returnDocument: 'after' }
  ).select('-__v');
};

export const VoucherService = {
  addVouture,
  getGlobalVoutures,
  getShopwiseVoutures,
  getCompensionVoutures,
  getAVouture,
  updateAVouture,
  updateVoutureStatus,
  removeVouture,
};
