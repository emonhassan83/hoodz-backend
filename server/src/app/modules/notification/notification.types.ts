import { NOTIFICATION_MODEL_TYPE } from '@/app/modules/notification/notification.constant';

export type INotificationModelType = keyof typeof NOTIFICATION_MODEL_TYPE;

export type TPromosionalNotificationPayload = {
  body: string;
  description: string;
  reference?: string | null;
};


