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
  assertSingleChatUsers,
  assertStaffSupportCreateAccess,
  getActiveAgentIds,
  getChatOrderOrThrow,
} from '@/app/modules/chat/chat.helpers';
import { Chat } from '@/app/modules/chat/chat.model';
import { TChatRequester, TCreateChatPayload } from '@/app/modules/chat/chat.types';
import {
  attachParticipantsToChats,
  getMyParticipantChatIds,
  getSharedChatIds,
  syncChatParticipants,
} from '@/app/modules/participant/participant.helpers';
import { USER_ROLE } from '@/app/modules/user/user.constant';

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

  return Chat.findOne({ _id: { $in: chatIds }, type, order: null })
    .sort({ createdAt: 1 })
    .populate(chatPopulate)
    .select('-__v');
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

/** Reads participant id from either spelling of the payload field. */
const getPayloadParticipantId = (payload: {
  participant?: string;
  participent?: string;
}) => payload.participant || payload.participent;

/** Creates or returns a 1:1 chat between requester and the other user. */
const createSingleChat = async (
  traceId: string,
  requester: TChatRequester,
  participantId: string
) => {
  await assertSingleChatUsers(traceId, requester, participantId);

  const sharedChatIds = await getSharedChatIds(requester.userId, participantId);
  const existingChat =
    sharedChatIds.length > 0
      ? await Chat.findOne({
          _id: { $in: sharedChatIds },
          type: CHAT_TYPES.single_chat,
        })
          .sort({ createdAt: 1 })
          .populate(chatPopulate)
          .select('-__v')
      : null;

  const chat =
    existingChat ||
    (await Chat.create({
      type: CHAT_TYPES.single_chat,
      order: null,
      status: CHAT_STATUS.active,
    }));

  await syncChatParticipants(chat._id, [requester.userId, participantId]);
  const populatedChat = await getPopulatedChatById(chat._id);
  return attachParticipantsToChat(populatedChat);
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

  if (payload.type === CHAT_TYPES.single_chat) {
    const participantId = getPayloadParticipantId(payload);
    if (!participantId) {
      throw new ApiError(
        HttpStatusCode.BadRequest,
        'Participant is required',
        traceId
      );
    }
    return createSingleChat(traceId, requester, participantId);
  }

  if (payload.type !== CHAT_TYPES.order_support || !payload.order) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Order is required', traceId);
  }

  return createOrderSupportChat(traceId, requester, payload.order);
};

/** Resolves chat id for send: existing singleton/order chat, or creates it. */
const resolveChatIdForSend = async (
  traceId: string,
  requester: TChatRequester,
  payload: {
    chatId?: string;
    type?: IChatType;
    order?: string;
    participant?: string;
    participent?: string;
  }
) => {
  if (payload.chatId) return payload.chatId;
  if (!payload.type || payload.type === CHAT_TYPES.ai_assistant) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'type is required when chatId is missing',
      traceId
    );
  }

  const chat = await createChat(traceId, requester, {
    type: payload.type,
    order: payload.order,
    participant: getPayloadParticipantId(payload),
  });
  return String(chat._id);
};

/** Returns chats where requester participates, excluding the AI assistant. */
const getMyChatList = async (requester: TChatRequester) => {
  const chatIds = await getMyParticipantChatIds(requester.userId);
  const chats = await Chat.find({
    _id: { $in: chatIds },
    type: {
      $nin: [CHAT_TYPES.ai_assistant, CHAT_TYPES.single_chat],
    },
  })
    .populate(chatPopulate)
    .sort({ updatedAt: -1 })
    .select('-__v')
    .lean();

  const withParticipants = await attachParticipantsToChats(chats);
  const isStaffInbox =
    requester.role === USER_ROLE.agent || requester.role === USER_ROLE.admin;

  const ofType = (type: IChatType) =>
    withParticipants.filter((chat) => chat.type === type);
  const oldestOne = (type: IChatType) => {
    const items = [...ofType(type)].sort(
      (left, right) =>
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    );
    return items[0] ?? null;
  };

  return {
    customer_support: isStaffInbox
      ? ofType(CHAT_TYPES.customer_support)
      : oldestOne(CHAT_TYPES.customer_support),
    staff_support: isStaffInbox
      ? ofType(CHAT_TYPES.staff_support)
      : oldestOne(CHAT_TYPES.staff_support),
    order_support: ofType(CHAT_TYPES.order_support),
  };
};

/** Returns or creates the user's single AI assistant chat. */
const getOrCreateAiAssistantChat = async (userId: string) =>
  createAiAssistantChat(userId);

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
  getOrCreateAiAssistantChat,
  resolveChatIdForSend,
};
