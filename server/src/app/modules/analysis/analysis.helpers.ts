import { MONTH_SHORT } from '@/app/constant';

export const parseYear = (value: unknown) => {
  const year = Number(value);
  if (Number.isInteger(year) && year >= 2000 && year <= 2100) return year;
  return new Date().getFullYear();
};

export const yearRange = (year: number) => ({
  $gte: new Date(Date.UTC(year, 0, 1)),
  $lt: new Date(Date.UTC(year + 1, 0, 1)),
});

export const fillMonthSeries = <T extends Record<string, number>>(
  rows: Array<{ month: number } & T>,
  emptyValues: T
) => {
  const byMonth = new Map(rows.map((row) => [row.month, row]));

  return MONTH_SHORT.map((month, index) => {
    const row = byMonth.get(index + 1);
    const values = { ...emptyValues };
    (Object.keys(emptyValues) as Array<keyof T>).forEach((key) => {
      values[key] = row?.[key] ?? emptyValues[key];
    });
    return { month, ...values };
  });
};

export const toMoney = (value: number) => Number(value.toFixed(2));

export const toCategoryPercentages = (
  rows: Array<{ category: string; count: number }>
) => {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  if (total === 0) return [];

  return rows
    .filter((row) => row.category)
    .map((row) => ({
      category: row.category,
      percentage: Math.round((row.count / total) * 100),
    }));
};
