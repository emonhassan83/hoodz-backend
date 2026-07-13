export const NOTIFICATION_MODEL_TYPE = {
  Auth: 'Auth',
  User : 'User',
} as const

export type INotificationModelType = keyof typeof NOTIFICATION_MODEL_TYPE
