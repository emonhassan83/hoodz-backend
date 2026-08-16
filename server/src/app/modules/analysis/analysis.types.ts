export type TAnalysisQuery = {
  revenueFilter?: unknown;
  orderFilter?: unknown;
  categoryFilter?: unknown;
  performenceFilter?: unknown;
  performanceFilter?: unknown;
};

export type TRevenueAnalysisItem = {
  month: string;
  amount: number;
};

export type TOrderAnalysisItem = {
  month: string;
  count: number;
};

export type TCategoryAnalysisItem = {
  category: string;
  percentage: number;
};

export type TOrdersPerformanceItem = {
  month: string;
  completeOrders: number;
  cancelOrders: number;
};

export type TAnalysisDashboard = {
  totalUsers: number;
  totalVendors: number;
  totalRiders: number;
  totalAgents: number;
  totalOrders: number;
  revenue: number;
  revenueAnalysis: TRevenueAnalysisItem[];
  orderAnalysis: TOrderAnalysisItem[];
  categoryAnalysis: TCategoryAnalysisItem[];
  ordersPerformance: TOrdersPerformanceItem[];
};
