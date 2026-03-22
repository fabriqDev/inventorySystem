export const TileIds = {
  INVENTORY: 'inventory',
  SALE_HISTORY: 'sale_history',
  NEW_SALE: 'new_sale',
  INVENTORY_TRANSFER: 'inventory_transfer',
  ADD_PRODUCTS: 'add_products',
  REQUESTED_ITEMS: 'requested_items_tile',
} as const;

export type TileId = (typeof TileIds)[keyof typeof TileIds];
