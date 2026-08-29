export const CHAT_TYPES = {
  ai_assistant: 'ai_assistant',
  customer_support: 'customer_support',
  order_support: 'order_support',
  single_chat: 'single_chat',
} as const;

export const CHAT_STATUS = {
  active: 'active',
  closed: 'closed',
} as const;

export type IChatStatus = (typeof CHAT_STATUS)[keyof typeof CHAT_STATUS];
export type IChatType = (typeof CHAT_TYPES)[keyof typeof CHAT_TYPES];
