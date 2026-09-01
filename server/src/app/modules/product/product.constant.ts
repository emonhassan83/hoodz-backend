export const COLLECTION_TYPE = {
  all: 'all',
  men: 'men',
  women: 'women',
  unisex: 'unisex',
  kids: 'kids',
  baby: 'baby',
} as const;

export const PRODUCT_INVENTORY_TYPE = {
  single: 'single',
  colorOnly: 'color_only',
  sizeColor: 'size_color',
} as const;

export const PRODUCT_BRAND_TYPE = {
  local: 'local',
  international: 'international',
  trending: 'trending',
  new: 'new',
} as const;

export const STOCK_FILTER = {
  low: 'low',
  inStock: 'inStock',
  outStock: 'outStock',
} as const;
