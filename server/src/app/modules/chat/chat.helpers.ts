import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import {
  CHAT_STATUS,
  CHAT_TYPES,
  IChatType,
} from '@/app/modules/chat/chat.constant';
import { Chat } from '@/app/modules/chat/chat.model';
import { TChatRequester } from '@/app/modules/chat/chat.types';
import { IOrders } from '@/app/modules/orders/orders.interface';
import { Orders } from '@/app/modules/orders/orders.model';
import {
  attachParticipantsToChats,
  getMyParticipantChatIds,
  getSharedChatIds,
  isChatParticipant,
  syncChatParticipants,
} from '@/app/modules/participant/participant.helpers';
import { USER_ROLE, USER_STATUS } from '@/app/modules/user/user.constant';
import { User } from '@/app/modules/user/user.model';

/** Throws when a chat participant does not exist. */
export const assertChatUserExists = async (traceId: string, userId: string) => {
  const user = await User.exists({ _id: userId, isDeleted: false });
  if (!user) {
    throw new ApiError(HttpStatusCode.NotFound, 'User not found', traceId);
  }
};

/** Returns active agent ids for support conversations. */
export const getActiveAgentIds = async () => {
  const agents = await User.find({
    role: USER_ROLE.agent,
    status: USER_STATUS.active,
    isDeleted: false,
  })
    .select('_id')
    .lean();

  return agents.map((agent) => agent._id.toString());
};

/** Loads an order or throws when it does not exist. */
export const getChatOrderOrThrow = async (traceId: string, orderId: string) => {
  const order = await Orders.findOne({ _id: orderId, isDeleted: false });
  if (!order) {
    throw new ApiError(HttpStatusCode.NotFound, 'Order not found', traceId);
  }

  return order;
};

/** Customer order chat is buyer <-> agents only. */
export const assertOrderSupportAccess = (
  traceId: string,
  order: IOrders,
  requester: TChatRequester
) => {
  const isBuyer = order.user?.toString() === requester.userId;
  const canAccess =
    requester.role === USER_ROLE.admin ||
    requester.role === USER_ROLE.agent ||
    isBuyer;

  if (!canAccess) {
    throw new ApiError(
      HttpStatusCode.Forbidden,
      'You cannot access this order support chat',
      traceId
    );
  }
};

/** Staff support is a singleton inbox for vendor/rider <-> agents. */
export const assertStaffSupportCreateAccess = (
  traceId: string,
  requester: TChatRequester
) => {
  const canCreate =
    requester.role === USER_ROLE.vendor ||
    requester.role === USER_ROLE.rider ||
    requester.role === USER_ROLE.admin;

  if (!canCreate) {
    throw new ApiError(
      HttpStatusCode.Forbidden,
      'Only vendor or rider can open staff support chat',
      traceId
    );
  }
};

const DIRECT_CHAT_ROLES = [
  USER_ROLE.user,
  USER_ROLE.rider,
  USER_ROLE.vendor,
] as const;

/** Throws when a 1:1 chat cannot be opened with the other user. */
export const assertSingleChatUsers = async (
  traceId: string,
  requester: TChatRequester,
  participantId: string
) => {
  if (requester.userId === participantId) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Cannot create a chat with yourself',
      traceId
    );
  }

  const canOpen = DIRECT_CHAT_ROLES.includes(
    requester.role as (typeof DIRECT_CHAT_ROLES)[number]
  );
  if (!canOpen) {
    throw new ApiError(
      HttpStatusCode.Forbidden,
      'Only customer, rider or shop can open a direct chat',
      traceId
    );
  }

  const otherUser = await User.findOne({
    _id: participantId,
    isDeleted: false,
  })
    .select('_id role')
    .lean();
  if (!otherUser) {
    throw new ApiError(HttpStatusCode.NotFound, 'Participant not found', traceId);
  }

  const otherCanJoin = DIRECT_CHAT_ROLES.includes(
    otherUser.role as (typeof DIRECT_CHAT_ROLES)[number]
  );
  if (!otherCanJoin) {
    throw new ApiError(
      HttpStatusCode.Forbidden,
      'Direct chat is only allowed with a customer, rider or shop',
      traceId
    );
  }
};

/** Returns whether the user already has singleton support chats. */
export const getUserSupportFlags = async (userId: string) => {
  const chatIds = await getMyParticipantChatIds(userId);
  if (chatIds.length === 0) {
    return { hasCustomerSupport: false, hasStaffSupport: false };
  }

  const chats = await Chat.find({
    _id: { $in: chatIds },
    type: { $in: [CHAT_TYPES.customer_support, CHAT_TYPES.staff_support] },
    order: null,
  })
    .select('type')
    .lean();

  return {
    hasCustomerSupport: chats.some(
      (chat) => chat.type === CHAT_TYPES.customer_support
    ),
    hasStaffSupport: chats.some((chat) => chat.type === CHAT_TYPES.staff_support),
  };
};

/** Returns whether an order already has an order_support chat. */
export const hasOrderSupportChat = async (orderId: string) =>
  Boolean(
    await Chat.exists({
      order: orderId,
      type: CHAT_TYPES.order_support,
    })
  );

/** Throws when requester is not inside the chat participants. */
export const assertChatAccess = async (
  traceId: string,
  chatId: string,
  requester: TChatRequester
) => {
  const isAdmin = requester.role === USER_ROLE.admin;
  const isParticipant = await isChatParticipant(chatId, requester.userId);

  if (!isAdmin && !isParticipant) {
    throw new ApiError(HttpStatusCode.Forbidden, 'You cannot access this chat', traceId);
  }
};

export const chatPopulate = [
  { path: 'order', select: 'id status paymentStatus totalAmount deliveryType' },
];

export const attachParticipantsToChat = async (chat: any) => {
  const [chatWithParticipants] = await attachParticipantsToChats([
    chat.toObject ? chat.toObject() : chat,
  ]);
  return chatWithParticipants;
};

export const getExistingUserChatByType = async (
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

export const getPopulatedChatById = async (chatId: unknown) => {
  return Chat.findById(chatId).populate(chatPopulate).select('-__v');
};

export const upsertOrderChat = async (orderId: string, type: IChatType) =>
  Chat.findOneAndUpdate(
    { order: orderId, type },
    {
      type,
      order: orderId,
      status: CHAT_STATUS.active,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).populate(chatPopulate);

export const createAiAssistantChat = async (userId: string) => {
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

export const createAgentSupportChat = async (userId: string, type: IChatType) => {
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

export const createOrderSupportChat = async (
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

export const getPayloadParticipantId = (payload: {
  participant?: string;
  participent?: string;
}) => payload.participant || payload.participent;

export const createSingleChat = async (
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
