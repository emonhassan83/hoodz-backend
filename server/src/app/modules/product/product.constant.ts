export const COLLECTION_TYPE = {
  men: 'men',
  woman: 'woman',
  unisex: 'unisex',
} as const;

export type ICollectionType = keyof typeof COLLECTION_TYPE;
