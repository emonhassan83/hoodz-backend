import { HttpStatusCode } from 'axios';
import { ClientSession } from 'mongoose';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import { User } from '@/app/modules/user/user.model';
import {
  getVendorTransctionSummary,
  mapVendorTransctionsToCards,
  vendorTransctionPopulate,
} from '@/app/modules/vendorTransction/vendorTransction.helpers';
import { VendorTransction } from '@/app/modules/vendorTransction/vendorTransction.model';

type TCreateVendorTransctionPayload = {
  vendorId: string;
  amount: number;
  note?: string | null;
  files?: string[];
  paidBy?: string;
  session?: ClientSession;
};

/** Persists a vendor payout transaction. */
const createVendorTransction = async (payload: TCreateVendorTransctionPayload) => {
  const [transaction] = await VendorTransction.create(
    [
      {
        vendor: payload.vendorId,
        amount: payload.amount,
        note: payload.note ?? null,
        files: payload.files ?? [],
        paidBy: payload.paidBy ?? null,
      },
    ],
    payload.session ? { session: payload.session } : undefined
  );

  return transaction;
};

const getVendorTransctions = async (
  vendorId: string,
  query: Record<string, unknown>
) => {
  const { vendorId: _vendorId, ...listQuery } = query;

  const transactionQuery = new QueryBuilder(
    VendorTransction.find({ vendor: vendorId })
      .populate(vendorTransctionPopulate)
      .select('_id id vendor amount note files paidBy createdAt')
      .lean(),
    listQuery
  )
    .filter()
    .sort()
    .paginate();

  const [transactions, meta, summary] = await Promise.all([
    transactionQuery.modelQuery,
    transactionQuery.countTotal(),
    getVendorTransctionSummary(vendorId),
  ]);

  return {
    meta,
    data: {
      balance: summary.balance,
      thisMonthTransction: summary.thisMonthTransction,
      totalTransction: summary.totalTransction,
      transction: mapVendorTransctionsToCards(transactions as any),
    },
  };
};

/** Vendor views their own payout transactions. */
const myPaymentTransction = async (
  vendorId: string,
  query: Record<string, unknown>
) => getVendorTransctions(vendorId, query);

/** Admin views payout transactions for a vendor. */
const getVendorTransction = async (
  traceId: string,
  vendorId: string,
  query: Record<string, unknown>
) => {
  const vendor = await User.findOne({
    _id: vendorId,
    role: USER_ROLE.vendor,
    isDeleted: false,
  })
    .select('_id')
    .lean();

  if (!vendor) {
    throw new ApiError(HttpStatusCode.NotFound, 'Vendor not found', traceId);
  }

  return getVendorTransctions(vendorId, query);
};

export const VendorTransctionService = {
  createVendorTransction,
  myPaymentTransction,
  getVendorTransction,
};
