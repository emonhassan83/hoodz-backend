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

  return Chat.findOne({ _id: { $in: chatIds }, type });
};

/** Loads a chat with order details for API response. */
const getPopulatedChatById = async (chatId: unknown) => {
  return Chat.findById(chatId).populate(chatPopulate).select('-__v');
};

/** Creates or returns a singleton/order-scoped chat. */
const createChat = async (
  traceId: string,
  requester: TChatRequester,
  payload: TCreateChatPayload
) => {
  await assertChatUserExists(traceId, requester.userId);

  if (payload.type === CHAT_TYPES.customer_support) {
    const existingChat = await getExistingUserChatByType(
      requester.userId,
      CHAT_TYPES.customer_support
    );
    const chat =
      existingChat ||
      (await Chat.create({
        type: CHAT_TYPES.customer_support,
        order: null,
        status: CHAT_STATUS.active,
      }));
    const agentIds = await getActiveAgentIds();

    await syncChatParticipants(chat!._id, [requester.userId, ...agentIds]);
    const populatedChat = await getPopulatedChatById(chat!._id);
    return attachParticipantsToChat(populatedChat);
  }

  if (payload.type === CHAT_TYPES.ai_assistant) {
    const existingChat = await getExistingUserChatByType(
      requester.userId,
      CHAT_TYPES.ai_assistant
    );
    const chat =
      existingChat ||
      (await Chat.create({
        type: CHAT_TYPES.ai_assistant,
        order: null,
        status: CHAT_STATUS.active,
      }));

    await syncChatParticipants(chat!._id, [requester.userId]);
    const populatedChat = await getPopulatedChatById(chat!._id);
    return attachParticipantsToChat(populatedChat);
  }

  if (!payload.order) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Order is required', traceId);
  }

  const order = await getChatOrderOrThrow(traceId, payload.order, requester);
  const participants = [
    order.user?.toString(),
    order.author.toString(),
    ...(await getActiveAgentIds()),
  ].filter(Boolean) as string[];

  const chat = await Chat.findOneAndUpdate(
    { order: payload.order, type: CHAT_TYPES.order_support },
    {
      type: CHAT_TYPES.order_support,
      order: payload.order,
      status: CHAT_STATUS.active,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).populate(chatPopulate);

  await syncChatParticipants(chat!._id, participants);
  return attachParticipantsToChat(chat);
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

  await assertChatAccess(traceId, chat._id.toString(), requester);
  return attachParticipantsToChat(chat);
};

export const ChatService = {
  createChat,
  getMyChatList,
  getChatId,
  getChatOrderById,
};


