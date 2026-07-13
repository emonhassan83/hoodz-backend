import { z } from 'zod';

const createNotificationSchema = z.object({
  body: z.object({
    receiver: z.string({ message: 'Receiver is required' }).min(1),
    message: z.string({ message: 'Message is required' }).min(1),
    description: z.string().optional(),
    reference: z.string().optional().nullable(),
    modelType: z.enum(['Auth', 'User'], {
      message: 'modelType must be Auth or User',
    }),
  }),
});

const generalNotificationSchema = z.object({
  body: z.object({
    message: z.string({ message: 'Message is required' }).min(1),
    description: z.string().optional(),
    modelType: z.enum(['Auth', 'User'], {
      message: 'modelType must be Auth or User',
    }),
  }),
});

export const NotificationValidation = {
  createNotificationSchema,
  generalNotificationSchema,
};
