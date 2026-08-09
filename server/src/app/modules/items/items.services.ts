import { Items } from "./items.model"

// Services for items module
const getItemsByOrderId = async (id: string) => {
  const result = await Items.find({ order: id }).populate([{ path: 'product' }])
  return result
}

export const ItemsService = {
  getItemsByOrderId,
}

