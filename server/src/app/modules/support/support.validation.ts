import { z } from 'zod';

const sendSupportEmailSchema = z.object({
  body: z.object({
    subject: z.string({
      message: 'Subject is required.',
    }).min(1, 'Subject cannot be empty.'),
    messages: z.string({
      message: 'Message is required.',
    }).min(1, 'Message cannot be empty.'),
  }),
});

export const SupportValidation = {
  sendSupportEmailSchema,
};
