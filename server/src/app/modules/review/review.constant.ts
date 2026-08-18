export const REVIEW_MODEL_TYPE = {
  Job: 'Job',
  Product: 'Product',
} as const;

export const REVIEW_SORT = {
  latest: 'latest',
  highest: 'highest',
  lowest: 'lowest',
} as const;

export const REVIEW_SORT_MAP: Record<string, string> = {
  [REVIEW_SORT.latest]: '-createdAt',
  [REVIEW_SORT.highest]: '-rating -createdAt',
  [REVIEW_SORT.lowest]: 'rating -createdAt',
};
