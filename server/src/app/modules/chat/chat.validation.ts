import { z } from 'zod';

import { CHAT_TYPES } from '@/app/modules/chat/chat.constant';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const createChatValidationSchema = z.object({
  body: z
    .object({
      type: z.enum(Object.values(CHAT_TYPES) as [string, ...string[]]),
      order: objectIdSchema.optional(),
      participant: objectIdSchema.optional(),
      participent: objectIdSchema.optional(),
    })
    .superRefine((data, ctx) => {
      if (data.type === CHAT_TYPES.order_support && !data.order) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['order'],
          message: 'Order is required for this chat type',
        });
      }

      if (
        data.type === CHAT_TYPES.single_chat &&
        !data.participant &&
        !data.participent
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['participant'],
          message: 'Participant is required for this chat type',
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

const userIdParamValidationSchema = z.object({
  params: z.object({
    userId: objectIdSchema,
  }),
});

const participantIdParamValidationSchema = z.object({
  params: z.object({
    participantId: objectIdSchema,
  }),
});

const getMyChatListQueryValidationSchema = z.object({
  query: z
    .object({
      type: z
        .enum([
          CHAT_TYPES.customer_support,
          CHAT_TYPES.order_support,
        ])
        .optional(),
      page: z.string().optional(),
      limit: z.string().optional(),
      sort: z.string().optional(),
    })
    .passthrough(),
});

export const ChatValidation = {
  createChatValidationSchema,
  chatIdParamValidationSchema,
  orderIdParamValidationSchema,
  userIdParamValidationSchema,
  participantIdParamValidationSchema,
  getMyChatListQueryValidationSchema,
};


