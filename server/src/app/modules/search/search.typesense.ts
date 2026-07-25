import { TypesenseHttpError, typesenseRequest } from '@/app/configs/typesense.configs';
import { Product } from '@/app/modules/product/product.model';
import {
  TSearchQuery,
  TTypesenseProductDocument,
  TTypesenseSearchResult,
  TTypesenseShopDocument,
} from '@/app/modules/search/search.types';
import { USER_ROLE, USER_STATUS } from '@/app/modules/user/user.constant';
import { User } from '@/app/modules/user/user.model';

const PRODUCT_COLLECTION = 'hoodz_products';
const SHOP_COLLECTION = 'hoodz_shops';

const productSchema = {
  name: PRODUCT_COLLECTION,
  fields: [
    { name: 'title', type: 'string' },
    { name: 'brand', type: 'string', facet: true },
    { name: 'description', type: 'string' },
    { name: 'sku', type: 'string' },
    { name: 'categoryId', type: 'string', facet: true },
    { name: 'categoryTitle', type: 'string', facet: true },
    { name: 'vendorId', type: 'string', facet: true },
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

const shopSchema = {
  name: SHOP_COLLECTION,
  fields: [
    { name: 'name', type: 'string' },
    { name: 'email', type: 'string' },
    { name: 'phone', type: 'string' },
    { name: 'address', type: 'string' },
    { name: 'profileAvatar', type: 'string' },
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

/** Ensures both Hoodz product and shop search collections exist. */
export const ensureTypesenseCollections = async () => {
  await Promise.all([
    ensureCollection(PRODUCT_COLLECTION, productSchema),
    ensureCollection(SHOP_COLLECTION, shopSchema),
  ]);
};

/** Converts a Mongo product document into a Typesense product document. */
export const buildTypesenseProductDocument = (product: any): TTypesenseProductDocument => ({
  id: product._id.toString(),
  title: product.title ?? '',
  brand: product.brand ?? '',
  description: product.description ?? '',
  sku: product.sku ?? '',
  categoryId: product.category?._id?.toString() ?? product.category?.toString() ?? '',
  categoryTitle: product.category?.title ?? '',
  vendorId: product.vendorId?._id?.toString() ?? product.vendorId?.toString() ?? '',
  vendorName: product.vendorId?.name ?? '',
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

/** Converts a vendor user document into a Typesense shop document. */
export const buildTypesenseShopDocument = (user: any): TTypesenseShopDocument => ({
  id: user._id.toString(),
  name: user.name ?? '',
  email: user.email ?? '',
  phone: user.phone ?? '',
  address: user.address ?? '',
  profileAvatar: user.profileAvatar ?? '',
  createdAt: user.createdAt
    ? Math.floor(new Date(user.createdAt).getTime() / 1000)
    : Math.floor(Date.now() / 1000),
});

/** Upserts one product document into Typesense. */
export const upsertProductToTypesense = async (productId: string) => {
  await ensureTypesenseCollections();
  const product = await Product.findOne({ _id: productId, isDeleted: false })
    .populate([
      { path: 'vendorId', select: 'name' },
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

/** Upserts one active vendor shop into Typesense. */
export const upsertShopToTypesense = async (userId: string) => {
  await ensureTypesenseCollections();
  const user = await User.findOne({
    _id: userId,
    role: USER_ROLE.vendor,
    status: USER_STATUS.active,
    isDeleted: false,
  }).lean();

  if (!user) return deleteShopFromTypesense(userId);

  return typesenseRequest({
    method: 'POST',
    path: `/collections/${SHOP_COLLECTION}/documents`,
    params: { action: 'upsert' },
    data: buildTypesenseShopDocument(user),
  });
};

/** Removes one shop document from Typesense. */
export const deleteShopFromTypesense = async (userId: string) => {
  await ensureTypesenseCollections();
  try {
    await typesenseRequest({
      method: 'DELETE',
      path: `/collections/${SHOP_COLLECTION}/documents/${userId}`,
    });
  } catch (error) {
    if (!(error instanceof TypesenseHttpError && error.status === 404)) {
      throw error;
    }
  }
};

/** Rebuilds Typesense indexes from MongoDB for products and shops. */
export const reindexTypesense = async () => {
  await ensureTypesenseCollections();

  const [products, shops] = await Promise.all([
    Product.find({ isDeleted: false })
      .populate([
        { path: 'vendorId', select: 'name' },
        { path: 'category', select: 'title' },
      ])
      .lean(),
    User.find({
      role: USER_ROLE.vendor,
      status: USER_STATUS.active,
      isDeleted: false,
    }).lean(),
  ]);

  await Promise.all([
    ...products.map((product) =>
      typesenseRequest({
        method: 'POST',
        path: `/collections/${PRODUCT_COLLECTION}/documents`,
        params: { action: 'upsert' },
        data: buildTypesenseProductDocument(product),
      })
    ),
    ...shops.map((shop) =>
      typesenseRequest({
        method: 'POST',
        path: `/collections/${SHOP_COLLECTION}/documents`,
        params: { action: 'upsert' },
        data: buildTypesenseShopDocument(shop),
      })
    ),
  ]);

  return { products: products.length, shops: shops.length };
};

/** Builds Typesense product filters from e-commerce search query params. */
const buildProductFilter = (query: TSearchQuery) => {
  const filters: string[] = ['inStock:=true'];

  if (query.category) filters.push(`categoryId:=${query.category}`);
  if (query.brand) filters.push(`brand:=${JSON.stringify(query.brand)}`);
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

/** Searches Typesense product and shop indexes with facets. */
export const searchTypesense = async (
  searchTerm: string,
  query: TSearchQuery
) => {
  await ensureTypesenseCollections();

  const page = Number(query.page || 1);
  const perPage = Math.min(Number(query.perPage || query.limit || 12), 30);

  const [productResult, shopResult] = await Promise.all([
    typesenseRequest<TTypesenseSearchResult<TTypesenseProductDocument>>({
      method: 'GET',
      path: `/collections/${PRODUCT_COLLECTION}/documents/search`,
      params: {
        q: searchTerm,
        query_by: 'title,brand,categoryTitle,vendorName,seoKeywords,description,sku',
        query_by_weights: '8,5,4,3,3,1,1',
        filter_by: buildProductFilter(query),
        facet_by: 'brand,categoryTitle,sizes,colors,collectionType,inStock',
        sort_by: resolveSortBy(query.sortBy),
        page,
        per_page: perPage,
        num_typos: '2,1,1,1,1,1,0',
        prefix: true,
      },
    }),
    typesenseRequest<TTypesenseSearchResult<TTypesenseShopDocument>>({
      method: 'GET',
      path: `/collections/${SHOP_COLLECTION}/documents/search`,
      params: {
        q: searchTerm,
        query_by: 'name,email,phone,address',
        query_by_weights: '8,2,2,1',
        page: 1,
        per_page: 8,
        num_typos: '2,1,0,1',
        prefix: true,
      },
    }),
  ]);

  return {
    products: productResult.hits?.map((hit) => hit.document) ?? [],
    shops: shopResult.hits?.map((hit) => hit.document) ?? [],
    facets: productResult.facet_counts ?? [],
    found: {
      products: productResult.found,
      shops: shopResult.found,
    },
    page: productResult.page,
  };
};

