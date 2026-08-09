export const COLLECTION_TYPE = {
  // Fashion & Apparel
  men: 'men',
  women: 'women',
  unisex: 'unisex',
  kids: 'kids',
  baby: 'baby',

  // Beauty & Personal Care
  beauty: 'beauty',
  skincare: 'skincare',
  health: 'health',
  personal_care: 'personal_care',

  // Electronics & Gadgets
  electronics: 'electronics',
  mobile_accessories: 'mobile_accessories',
  computers: 'computers',
  home_appliances: 'home_appliances',

  // Home & Living
  home_decor: 'home_decor',
  kitchen: 'kitchen',
  furniture: 'furniture',
  garden_outdoor: 'garden_outdoor',

  // Lifestyle & Accessories
  accessories: 'accessories',
  jewelry: 'jewelry',
  watches: 'watches',
  bags_luggage: 'bags_luggage',
  shoes: 'shoes',

  // Sports & Entertainment
  sports: 'sports',
  fitness: 'fitness',
  gaming: 'gaming',
  toys: 'toys',
  books_stationery: 'books_stationery',

  // Others
  pets: 'pets',
  automotive: 'automotive', 
  groceries: 'groceries',
  office_supplies: 'office_supplies'
} as const;

export const PRODUCT_INVENTORY_TYPE = {
  single: 'single',
  colorOnly: 'color_only',
  sizeColor: 'size_color',
} as const;

export type TCollection = keyof typeof COLLECTION_TYPE;

