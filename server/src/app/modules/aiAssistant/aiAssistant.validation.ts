import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const sendMessageValidationSchema = z.object({
  body: z.object({
    chatId: objectIdSchema.optional(),
    message: z.string().trim().min(1).max(1000),
  }),
});

export const AiAssistantValidation = {
  sendMessageValidationSchema,
};


