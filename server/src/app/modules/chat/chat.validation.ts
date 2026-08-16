import { z } from 'zod';

import { CHAT_TYPES } from '@/app/modules/chat/chat.constant';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const createChatValidationSchema = z.object({
  body: z
    .object({
      type: z.enum(Object.values(CHAT_TYPES) as [string, ...string[]]),
      order: objectIdSchema.optional(),
    })
    .superRefine((data, ctx) => {
      if (data.type === CHAT_TYPES.order_support && !data.order) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['order'],
          message: 'Order is required for this chat type',
        });
      }
    }),
});

const chatIdParamValidationSchema = z.object({
  params: z.object({
    chatId: objectIdSchema,
  }),
});

const orderIdParamValidationSchema = z.object({
  params: z.object({
    orderId: objectIdSchema,
  }),
});

export const ChatValidation = {
  createChatValidationSchema,
  chatIdParamValidationSchema,
  orderIdParamValidationSchema,
};


