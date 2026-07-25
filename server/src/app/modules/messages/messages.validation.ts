import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const getMessagesByChatIdValidationSchema = z.object({
  params: z.object({
    chatId: objectIdSchema,
  }),
});

export const MessagesValidation = {
  getMessagesByChatIdValidationSchema,
};

