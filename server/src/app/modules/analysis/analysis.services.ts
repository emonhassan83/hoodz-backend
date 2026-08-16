import {
  fillMonthSeries,
  parseYear,
  toCategoryPercentages,
  toMoney,
  yearRange,
} from '@/app/modules/analysis/analysis.helpers';
import {
  TAnalysisDashboard,
  TAnalysisQuery,
} from '@/app/modules/analysis/analysis.types';
import {
  ORDER_STATUS,
  PAYMENT_STATUS,
} from '@/app/modules/orders/orders.constant';
import { Orders } from '@/app/modules/orders/orders.model';
import { Product } from '@/app/modules/product/product.model';
import { USER_ROLE, USER_STATUS } from '@/app/modules/user/user.constant';
import { User } from '@/app/modules/user/user.model';
import { IUserRole } from '@/app/modules/user/user.types';

const activeUserMatch = (role: IUserRole) => ({
  role,
  status: USER_STATUS.active,
  isDeleted: false,
});

const activeOrderMatch = {
  isDeleted: false,
  status: { $ne: ORDER_STATUS.cancelled },
  paymentStatus: { $ne: PAYMENT_STATUS.refunded },
};

const paidOrderMatch = {
  isDeleted: false,
  paymentStatus: PAYMENT_STATUS.paid,
};

const getDashboard = async (query: TAnalysisQuery): Promise<TAnalysisDashboard> => {
  const revenueYear = parseYear(query.revenueFilter);
  const orderYear = parseYear(query.orderFilter);
  const categoryYear = parseYear(query.categoryFilter);
  const performanceYear = parseYear(
    query.performenceFilter ?? query.performanceFilter
  );

  const [
    totalUsers,
    totalVendors,
    totalRiders,
    totalAgents,
    totalOrders,
    revenueRows,
    revenueAnalysisRows,
    orderAnalysisRows,
    categoryRows,
    performanceRows,
  ] = await Promise.all([
    User.countDocuments(activeUserMatch(USER_ROLE.user)),
    User.countDocuments(activeUserMatch(USER_ROLE.vendor)),
    User.countDocuments(activeUserMatch(USER_ROLE.rider)),
    User.countDocuments(activeUserMatch(USER_ROLE.agent)),
    Orders.countDocuments(activeOrderMatch),
    Orders.aggregate<{ total: number }>([
      { $match: paidOrderMatch },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]),
    Orders.aggregate<{ month: number; amount: number }>([
      {
        $match: {
          ...paidOrderMatch,
          createdAt: yearRange(revenueYear),
        },
      },
      {
        $group: {
          _id: { $month: '$createdAt' },
          amount: { $sum: '$totalAmount' },
        },
      },
      { $project: { _id: 0, month: '$_id', amount: 1 } },
    ]),
    Orders.aggregate<{ month: number; count: number }>([
      {
        $match: {
          ...activeOrderMatch,
          createdAt: yearRange(orderYear),
        },
      },
      {
        $group: {
          _id: { $month: '$createdAt' },
          count: { $sum: 1 },
        },
      },
      { $project: { _id: 0, month: '$_id', count: 1 } },
    ]),
    Product.aggregate<{ category: string; count: number }>([
      {
        $match: {
          isDeleted: false,
          createdAt: yearRange(categoryYear),
        },
      },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'category',
        },
      },
      { $unwind: '$category' },
      { $project: { _id: 0, category: '$category.title', count: 1 } },
    ]),
    Orders.aggregate<{
      month: number;
      completeOrders: number;
      cancelOrders: number;
    }>([
      {
        $match: {
          isDeleted: false,
          createdAt: yearRange(performanceYear),
        },
      },
      {
        $group: {
          _id: { $month: '$createdAt' },
          completeOrders: {
            $sum: {
              $cond: [{ $eq: ['$status', ORDER_STATUS.delivered] }, 1, 0],
            },
          },
          cancelOrders: {
            $sum: {
              $cond: [{ $eq: ['$status', ORDER_STATUS.cancelled] }, 1, 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          month: '$_id',
          completeOrders: 1,
          cancelOrders: 1,
        },
      },
    ]),
  ]);

  return {
    totalUsers,
    totalVendors,
    totalRiders,
    totalAgents,
    totalOrders,
    revenue: toMoney(revenueRows[0]?.total ?? 0),
    revenueAnalysis: fillMonthSeries(revenueAnalysisRows, { amount: 0 }).map(
      (item) => ({
        month: item.month,
        amount: toMoney(item.amount),
      })
    ),
    orderAnalysis: fillMonthSeries(orderAnalysisRows, { count: 0 }),
    categoryAnalysis: toCategoryPercentages(categoryRows),
    ordersPerformance: fillMonthSeries(performanceRows, {
      completeOrders: 0,
      cancelOrders: 0,
    }),
  };
};

export const AnalysisService = {
  getDashboard,
};
