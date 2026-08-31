import { z } from 'zod';

import { NOTIFICATION_MODEL_TYPE } from '@/app/modules/notification/notification.constant';

const modelTypeSchema = z.enum(
  Object.values(NOTIFICATION_MODEL_TYPE) as [string, ...string[]]
);

const createNotificationSchema = z.object({
  body: z.object({
    receiver: z.string({ message: 'Receiver is required' }).min(1),
    message: z.string({ message: 'Message is required' }).min(1),
    description: z.string().optional(),
    reference: z.string().optional().nullable(),
    modelType: modelTypeSchema,
  }),
});

const promosionalNotificationSchema = z.object({
  body: z.object({
    body: z.string({ message: 'Body is required' }).min(1),
    description: z.string({ message: 'Description is required' }).min(1),
    reference: z.string().optional().nullable(),
  }),
});

export const NotificationValidation = {
  createNotificationSchema,
  promosionalNotificationSchema,
};


