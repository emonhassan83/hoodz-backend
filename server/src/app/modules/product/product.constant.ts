export const COLLECTION_TYPE = {
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

export type TCollection = keyof typeof COLLECTION_TYPE;
