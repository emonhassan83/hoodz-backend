import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import {
  CHAT_STATUS,
  CHAT_TYPES,
  IChatType,
} from '@/app/modules/chat/chat.constant';
import {
  assertChatAccess,
  assertChatUserExists,
  assertOrderSupportAccess,
  assertStaffSupportCreateAccess,
  getActiveAgentIds,
  getChatOrderOrThrow,
} from '@/app/modules/chat/chat.helpers';
import { Chat } from '@/app/modules/chat/chat.model';
import { TChatRequester, TCreateChatPayload } from '@/app/modules/chat/chat.types';
import {
  attachParticipantsToChats,
  getMyParticipantChatIds,
  syncChatParticipants,
} from '@/app/modules/participant/participant.helpers';

const chatPopulate = [
  { path: 'order', select: 'id status paymentStatus totalAmount deliveryType' },
];

/** Adds populated participant rows to one chat document. */
const attachParticipantsToChat = async (chat: any) => {
  const [chatWithParticipants] = await attachParticipantsToChats([
    chat.toObject ? chat.toObject() : chat,
  ]);
  return chatWithParticipants;
};

/** Finds the user's existing singleton chat for a specific chat type. */
const getExistingUserChatByType = async (
  userId: string,
  type: IChatType
) => {
  const chatIds = await getMyParticipantChatIds(userId);
  if (chatIds.length === 0) return null;

  return Chat.findOne({ _id: { $in: chatIds }, type, order: null });
};

/** Loads a chat with order details for API response. */
const getPopulatedChatById = async (chatId: unknown) => {
  return Chat.findById(chatId).populate(chatPopulate).select('-__v');
};

const upsertOrderChat = async (orderId: string, type: IChatType) =>
  Chat.findOneAndUpdate(
    { order: orderId, type },
    {
      type,
      order: orderId,
      status: CHAT_STATUS.active,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).populate(chatPopulate);

/** Creates or returns a user-only AI assistant chat. */
const createAiAssistantChat = async (userId: string) => {
  const existingChat = await getExistingUserChatByType(
    userId,
    CHAT_TYPES.ai_assistant
  );
  const chat =
    existingChat ||
    (await Chat.create({
      type: CHAT_TYPES.ai_assistant,
      order: null,
      status: CHAT_STATUS.active,
    }));

  await syncChatParticipants(chat._id, [userId]);
  const populatedChat = await getPopulatedChatById(chat._id);
  return attachParticipantsToChat(populatedChat);
};

/** Creates or returns a singleton requester <-> agent support chat. */
const createAgentSupportChat = async (userId: string, type: IChatType) => {
  const existingChat = await getExistingUserChatByType(userId, type);
  const chat =
    existingChat ||
    (await Chat.create({
      type,
      order: null,
      status: CHAT_STATUS.active,
    }));
  const agentIds = await getActiveAgentIds();

  await syncChatParticipants(chat._id, [userId, ...agentIds]);
  const populatedChat = await getPopulatedChatById(chat._id);
  return attachParticipantsToChat(populatedChat);
};

/** Creates or returns buyer <-> agent chat for one order. */
const createOrderSupportChat = async (
  traceId: string,
  requester: TChatRequester,
  orderId: string
) => {
  const order = await getChatOrderOrThrow(traceId, orderId);
  assertOrderSupportAccess(traceId, order, requester);

  const buyerId = order.user?.toString();
  if (!buyerId) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Order has no customer', traceId);
  }

  const chat = await upsertOrderChat(orderId, CHAT_TYPES.order_support);
  await syncChatParticipants(chat._id, [buyerId, ...(await getActiveAgentIds())]);
  return attachParticipantsToChat(chat);
};

/** Creates or returns a singleton/order-scoped chat. */
const createChat = async (
  traceId: string,
  requester: TChatRequester,
  payload: TCreateChatPayload
) => {
  await assertChatUserExists(traceId, requester.userId);

  if (payload.type === CHAT_TYPES.ai_assistant) {
    return createAiAssistantChat(requester.userId);
  }

  if (payload.type === CHAT_TYPES.customer_support) {
    return createAgentSupportChat(requester.userId, CHAT_TYPES.customer_support);
  }

  if (payload.type === CHAT_TYPES.staff_support) {
    assertStaffSupportCreateAccess(traceId, requester);
    return createAgentSupportChat(requester.userId, CHAT_TYPES.staff_support);
  }

  if (!payload.order) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Order is required', traceId);
  }

  return createOrderSupportChat(traceId, requester, payload.order);
};

/** Returns chats where requester participates. */
const getMyChatList = async (requester: TChatRequester) => {
  const chatIds = await getMyParticipantChatIds(requester.userId);
  const chats = await Chat.find({ _id: { $in: chatIds } })
    .populate(chatPopulate)
    .sort({ updatedAt: -1 })
    .select('-__v')
    .lean();

  return attachParticipantsToChats(chats);
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

  await assertChatAccess(traceId, chat._id.toString(), requester);
  return attachParticipantsToChat(chat);
};

/** Returns one order-scoped support chat after access check. */
const getChatOrderById = async (
  traceId: string,
  requester: TChatRequester,
  orderId: string
) => {
  const order = await getChatOrderOrThrow(traceId, orderId);
  assertOrderSupportAccess(traceId, order, requester);

  const chat = await Chat.findOne({
    order: orderId,
    type: CHAT_TYPES.order_support,
  })
    .populate(chatPopulate)
    .select('-__v');

  if (!chat) {
    throw new ApiError(HttpStatusCode.NotFound, 'Chat not found', traceId);
  }

  await assertChatAccess(traceId, chat._id.toString(), requester);
  return attachParticipantsToChat(chat);
};

export const ChatService = {
  createChat,
  getMyChatList,
  getChatId,
  getChatOrderById,
};
