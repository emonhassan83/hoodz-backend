import { Types } from 'mongoose';

import { User } from '@/app/modules/user/user.model';
import { VendorTransction } from '@/app/modules/vendorTransction/vendorTransction.model';

export const vendorTransctionPopulate = [
  {
    path: 'vendor',
    select: '_id id name email profileAvatar balance',
  },
  {
    path: 'paidBy',
    select: '_id name email profileAvatar role',
  },
];

export const mapVendorTransctionsToCards = (
  transactions: Array<Record<string, any>>
) =>
  transactions.map((transaction) => {
    const vendor = transaction.vendor;
    const paidBy = transaction.paidBy;

    return {
      _id: transaction._id,
      id: transaction.id,
      vendor:
        vendor && typeof vendor === 'object'
          ? {
              _id: vendor._id,
              id: vendor.id ?? null,
              name: vendor.name ?? null,
              email: vendor.email ?? null,
              profileAvatar: vendor.profileAvatar ?? null,
            }
          : transaction.vendor,
      amount: Number((transaction.amount ?? 0).toFixed(2)),
      note: transaction.note ?? null,
      files: transaction.files ?? [],
      paidBy:
        paidBy && typeof paidBy === 'object'
          ? {
              _id: paidBy._id,
              name: paidBy.name ?? null,
              email: paidBy.email ?? null,
              profileAvatar: paidBy.profileAvatar ?? null,
              role: paidBy.role ?? null,
            }
          : transaction.paidBy ?? null,
      createdAt: transaction.createdAt,
    };
  });

export const getVendorTransctionSummary = async (vendorId: string) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const vendorObjectId = new Types.ObjectId(vendorId);

  const [vendor, monthAgg, totalAgg] = await Promise.all([
    User.findById(vendorId).select('balance').lean(),
    VendorTransction.aggregate([
      {
        $match: {
          vendor: vendorObjectId,
          createdAt: { $gte: startOfMonth },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    VendorTransction.aggregate([
      { $match: { vendor: vendorObjectId } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);

  return {
    balance: Number((vendor?.balance ?? 0).toFixed(2)),
    thisMonthTransction: Number((monthAgg[0]?.total ?? 0).toFixed(2)),
    totalTransction: Number((totalAgg[0]?.total ?? 0).toFixed(2)),
  };
};
