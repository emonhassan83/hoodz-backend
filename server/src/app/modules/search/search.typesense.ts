import { TypesenseHttpError, typesenseRequest } from '@/app/configs/typesense.configs';
import { Product } from '@/app/modules/product/product.model';
import {
  TSearchQuery,
  TTypesenseProductDocument,
  TTypesenseSearchResult,
} from '@/app/modules/search/search.types';

const PRODUCT_COLLECTION = 'hoodz_products';
const SEARCH_SUGGESTION_SOURCE_LIMIT = 15;

const productSchema = {
  name: PRODUCT_COLLECTION,
  fields: [
    { name: 'title', type: 'string' },
    { name: 'description', type: 'string' },
    { name: 'sku', type: 'string' },
    { name: 'categoryId', type: 'string', facet: true },
    { name: 'categoryTitle', type: 'string', facet: true },
    { name: 'vendor', type: 'string', facet: true },
    { name: 'vendorName', type: 'string' },
    { name: 'collectionType', type: 'string', facet: true },
    { name: 'images', type: 'string[]' },
    { name: 'sizes', type: 'string[]', facet: true },
    { name: 'colors', type: 'string[]', facet: true },
    { name: 'price', type: 'float', facet: true },
    { name: 'discountPrice', type: 'float', facet: true },
    { name: 'stock', type: 'int32', facet: true },
    { name: 'avgRating', type: 'float', facet: true },
    { name: 'ratingCount', type: 'int32', facet: true },
    { name: 'sold', type: 'int32', facet: true },
    { name: 'inStock', type: 'bool', facet: true },
    { name: 'seoKeywords', type: 'string[]' },
    { name: 'createdAt', type: 'int64' },
  ],
  default_sorting_field: 'createdAt',
};

/** Creates a Typesense collection if it does not already exist. */
const ensureCollection = async (name: string, schema: Record<string, unknown>) => {
  try {
    await typesenseRequest({ method: 'GET', path: `/collections/${name}` });
  } catch (error) {
    if (error instanceof TypesenseHttpError && error.status === 404) {
      await typesenseRequest({ method: 'POST', path: '/collections', data: schema });
      return;
    }

    throw error;
  }
};

/** Ensures the Hoodz product search collection exists. */
export const ensureTypesenseCollections = async () => {
  await ensureCollection(PRODUCT_COLLECTION, productSchema);
};

/** Converts a Mongo product document into a Typesense product document. */
export const buildTypesenseProductDocument = (product: any): TTypesenseProductDocument => ({
  id: product._id.toString(),
  title: product.title ?? '',
  description: product.description ?? '',
  sku: product.sku ?? '',
  categoryId: product.category?._id?.toString() ?? product.category?.toString() ?? '',
  categoryTitle: product.category?.title ?? '',
  vendor: product.vendor?._id?.toString() ?? product.vendor?.toString() ?? '',
  vendorName: product.vendor?.name ?? '',
  collectionType: product.collectionType ?? '',
  images: product.images ?? [],
  sizes: product.sizes ?? [],
  colors: (product.colors ?? []).map((color: { name?: string; code?: string }) =>
    color.name || color.code || ''
  ).filter(Boolean),
  price: product.price ?? 0,
  discountPrice: product.discountPrice ?? product.price ?? 0,
  stock: product.stock ?? 0,
  avgRating: product.avgRating ?? 0,
  ratingCount: product.ratingCount ?? 0,
  sold: product.sold ?? 0,
  inStock: Number(product.stock ?? 0) > 0,
  seoKeywords: product.seo?.metaKeywords ?? [],
  createdAt: product.createdAt
    ? Math.floor(new Date(product.createdAt).getTime() / 1000)
    : Math.floor(Date.now() / 1000),
});

/** Upserts one product document into Typesense. */
export const upsertProductToTypesense = async (productId: string) => {
  await ensureTypesenseCollections();
  const product = await Product.findOne({ _id: productId, isDeleted: false })
    .populate([
      { path: 'vendor', select: 'name' },
      { path: 'category', select: 'title' },
    ])
    .lean();

  if (!product) return deleteProductFromTypesense(productId);

  return typesenseRequest({
    method: 'POST',
    path: `/collections/${PRODUCT_COLLECTION}/documents`,
    params: { action: 'upsert' },
    data: buildTypesenseProductDocument(product),
  });
};

/** Removes one product document from Typesense. */
export const deleteProductFromTypesense = async (productId: string) => {
  await ensureTypesenseCollections();
  try {
    await typesenseRequest({
      method: 'DELETE',
      path: `/collections/${PRODUCT_COLLECTION}/documents/${productId}`,
    });
  } catch (error) {
    if (!(error instanceof TypesenseHttpError && error.status === 404)) {
      throw error;
    }
  }
};

/** Kept for vendor flows; shop search indexing is disabled for product-only search. */
export const upsertShopToTypesense = async (_userId: string) => null;

/** Kept for vendor flows; shop search indexing is disabled for product-only search. */
export const deleteShopFromTypesense = async (_userId: string) => null;

/** Rebuilds the Typesense index from MongoDB products. */
export const reindexTypesense = async () => {
  await ensureTypesenseCollections();

  const products = await Product.find({ isDeleted: false })
    .populate([
      { path: 'vendor', select: 'name' },
      { path: 'category', select: 'title' },
    ])
    .lean();

  await Promise.all(
    products.map((product) =>
      typesenseRequest({
        method: 'POST',
        path: `/collections/${PRODUCT_COLLECTION}/documents`,
        params: { action: 'upsert' },
        data: buildTypesenseProductDocument(product),
      })
    )
  );

  return { products: products.length };
};

/** Builds Typesense product filters from e-commerce search query params. */
const buildProductFilter = (query: TSearchQuery) => {
  const filters: string[] = ['inStock:=true'];

  if (query.category) filters.push(`categoryId:=${query.category}`);
  if (query.collectionType) filters.push(`collectionType:=${query.collectionType}`);
  if (query.size) filters.push(`sizes:=${JSON.stringify(query.size)}`);
  if (query.color) filters.push(`colors:=${JSON.stringify(query.color)}`);
  if (query.inStock === false || query.inStock === 'false') {
    filters.splice(filters.indexOf('inStock:=true'), 1);
  }
  if (query.minPrice) filters.push(`discountPrice:>=${Number(query.minPrice)}`);
  if (query.maxPrice) filters.push(`discountPrice:<=${Number(query.maxPrice)}`);

  return filters.join(' && ');
};

/** Resolves Typesense sort order from product search query params. */
const resolveSortBy = (sortBy?: TSearchQuery['sortBy']) => {
  if (sortBy === 'latest') return 'createdAt:desc';
  if (sortBy === 'priceLowToHigh') return 'discountPrice:asc';
  if (sortBy === 'priceHighToLow') return 'discountPrice:desc';
  return '_text_match:desc,inStock:desc,createdAt:desc';
};

/** Searches the Typesense product index with facets and product-title suggestions. */
export const searchTypesense = async (
  searchTerm: string,
  query: TSearchQuery
) => {
  await ensureTypesenseCollections();

  const productResult = await typesenseRequest<TTypesenseSearchResult<TTypesenseProductDocument>>({
    method: 'GET',
    path: `/collections/${PRODUCT_COLLECTION}/documents/search`,
    params: {
      q: searchTerm,
      query_by: 'title,categoryTitle,vendorName,seoKeywords,description,sku',
      query_by_weights: '8,4,3,3,1,1',
      filter_by: buildProductFilter(query),
      facet_by: 'categoryTitle,sizes,colors,collectionType,inStock',
      sort_by: resolveSortBy(query.sortBy),
      page: 1,
      per_page: SEARCH_SUGGESTION_SOURCE_LIMIT,
      num_typos: '2,1,1,1,1,0',
      prefix: true,
    },
  });

  const products = productResult.hits?.map((hit) => hit.document) ?? [];
  const suggestionMap = new Map<string, { query: string; resultCount: number }>();

  products.forEach((product) => {
    const suggestion = product.title.trim().replace(/\s+/g, ' ');
    const key = suggestion.toLowerCase();
    if (!key) return;
    const current = suggestionMap.get(key);
    suggestionMap.set(key, {
      query: suggestion,
      resultCount: (current?.resultCount ?? 0) + 1,
    });
  });

  return {
    suggestions: [...suggestionMap.values()].slice(0, 8),
  };
};


