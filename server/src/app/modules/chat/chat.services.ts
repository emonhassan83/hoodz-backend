import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { CHAT_STATUS, CHAT_TYPES } from '@/app/modules/chat/chat.constant';
import {
  assertChatAccess,
  assertChatUserExists,
  getChatOrderOrThrow,
} from '@/app/modules/chat/chat.helpers';
import { Chat } from '@/app/modules/chat/chat.model';
import { TChatRequester, TCreateChatPayload } from '@/app/modules/chat/chat.types';

const chatPopulate = [
  { path: 'participants', select: 'name email phone profileAvatar role' },
  { path: 'order', select: 'id status paymentStatus totalAmount deliveryType' },
  { path: 'user', select: 'name email phone profileAvatar role' },
];

/** Creates or returns a singleton/order-scoped chat. */
const createChat = async (
  traceId: string,
  requester: TChatRequester,
  payload: TCreateChatPayload
) => {
  await assertChatUserExists(traceId, requester.userId);

  if (payload.type === CHAT_TYPES.customer_support) {
    return Chat.findOneAndUpdate(
      { user: requester.userId, type: CHAT_TYPES.customer_support },
      {
        user: requester.userId,
        type: CHAT_TYPES.customer_support,
        order: null,
        participants: [requester.userId],
        status: CHAT_STATUS.accepted,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).populate(chatPopulate);
  }

  if (payload.type === CHAT_TYPES.ai_assistant) {
    return Chat.findOneAndUpdate(
      { user: requester.userId, type: CHAT_TYPES.ai_assistant },
      {
        user: requester.userId,
        type: CHAT_TYPES.ai_assistant,
        order: null,
        participants: [requester.userId],
        status: CHAT_STATUS.accepted,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).populate(chatPopulate);
  }

  if (!payload.order) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Order is required', traceId);
  }

  const order = await getChatOrderOrThrow(traceId, payload.order, requester);
  const participants = [
    order.user?.toString(),
    order.author.toString(),
  ].filter(Boolean) as string[];

  return Chat.findOneAndUpdate(
    { order: payload.order, type: CHAT_TYPES.order_support },
    {
      user: order.user ?? requester.userId,
      type: CHAT_TYPES.order_support,
      order: payload.order,
      participants,
      status: CHAT_STATUS.accepted,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).populate(chatPopulate);
};

/** Returns chats where requester participates. */
const getMyChatList = async (requester: TChatRequester) => {
  return Chat.find({ participants: requester.userId })
    .populate(chatPopulate)
    .sort({ updatedAt: -1 })
    .select('-__v');
};

/** Returns one chat by chat id after access check. */
const getChatId = async (
  traceId: string,
  requester: TChatRequester,
  chatId: string
) => {
  const chat = await Chat.findById(chatId)
    .populate(chatPopulate)
    .select('-__v');
  if (!chat) {
    throw new ApiError(HttpStatusCode.NotFound, 'Chat not found', traceId);
  }

  assertChatAccess(traceId, chat, requester);
  return chat;
};

/** Returns one order-support chat by order id after access check. */
const getChatOrderById = async (
  traceId: string,
  requester: TChatRequester,
  orderId: string
) => {
  await getChatOrderOrThrow(traceId, orderId, requester);

  const chat = await Chat.findOne({
    order: orderId,
    type: CHAT_TYPES.order_support,
  })
    .populate(chatPopulate)
    .select('-__v');

  if (!chat) {
    throw new ApiError(HttpStatusCode.NotFound, 'Chat not found', traceId);
  }

  assertChatAccess(traceId, chat, requester);
  return chat;
};

export const ChatService = {
  createChat,
  getMyChatList,
  getChatId,
  getChatOrderById,
};
