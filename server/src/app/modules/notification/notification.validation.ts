import { z } from 'zod';

import { NOTIFICATION_MODEL_TYPE } from '@/app/modules/notification/notification.constant';
import { USER_ROLE } from '@/app/modules/user/user.constant';

const modelTypeSchema = z.enum(
  Object.values(NOTIFICATION_MODEL_TYPE) as [string, ...string[]]
);
const userRoleSchema = z.enum(
  Object.values(USER_ROLE) as [string, ...string[]]
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

const generalNotificationSchema = z.object({
  body: z
    .object({
      message: z.string({ message: 'Message is required' }).min(1),
      description: z.string().optional(),
      reference: z.string().optional().nullable(),
      modelType: modelTypeSchema,
      role: userRoleSchema.optional(),
      roles: z.array(userRoleSchema).min(1).optional(),
    })
    .refine((data) => !(data.role && data.roles), {
      message: 'Use either role or roles, not both',
      path: ['roles'],
    }),
});

export const NotificationValidation = {
  createNotificationSchema,
  generalNotificationSchema,
};


