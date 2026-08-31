import { HttpStatusCode } from 'axios';
import { Types } from 'mongoose';

import ApiError from '@/app/errors/ApiError';
import {
  CHAT_STATUS,
  CHAT_TYPES,
  IChatType,
} from '@/app/modules/chat/chat.constant';
import { Chat } from '@/app/modules/chat/chat.model';
import { TChatRequester } from '@/app/modules/chat/chat.types';
import { Messages } from '@/app/modules/messages/messages.model';
import { IOrders } from '@/app/modules/orders/orders.interface';
import { Orders } from '@/app/modules/orders/orders.model';
import {
  attachParticipantsToChats,
  getMyParticipantChatIds,
  getSharedChatIds,
  isChatParticipant,
  pruneChatParticipantsExcept,
  syncChatParticipants,
} from '@/app/modules/participant/participant.helpers';
import {
  assertAgentAssignedToCustomer,
  getCustomerIdForChat,
  resolveOrAssignAgentForCustomer,
} from '@/app/modules/supportAssignment/supportAssignment.helpers';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import { User } from '@/app/modules/user/user.model';

/** Throws when a chat participant does not exist. */
export const assertChatUserExists = async (traceId: string, userId: string) => {
  const user = await User.exists({ _id: userId, isDeleted: false });
  if (!user) {
    throw new ApiError(HttpStatusCode.NotFound, 'User not found', traceId);
  }
};

let chatIndexesReady = false;

/** Drops legacy chat indexes that block multiple support chats per type. */
export const ensureChatIndexes = async () => {
  if (chatIndexesReady) return;

  const indexes = await Chat.collection.indexes();
  const legacyIndexes = indexes.filter((index) => {
    const keys = Object.keys(index.key ?? {});
    return keys.includes('user');
  });

  await Promise.all(
    legacyIndexes
      .map((index) => index.name)
      .filter(Boolean)
      .map((name) => Chat.collection.dropIndex(name as string).catch(() => undefined))
  );

  await Chat.syncIndexes();
  chatIndexesReady = true;
};

/** Loads an order or throws when it does not exist. */
export const getChatOrderOrThrow = async (traceId: string, orderId: string) => {
  const order = await Orders.findOne({ _id: orderId, isDeleted: false });
  if (!order) {
    throw new ApiError(HttpStatusCode.NotFound, 'Order not found', traceId);
  }

  return order;
};

/** Customer order chat is buyer <-> assigned agent only. */
export const assertOrderSupportAccess = async (
  traceId: string,
  order: IOrders,
  requester: TChatRequester
) => {
  const buyerId = order.user?.toString();
  const isBuyer = buyerId === requester.userId;

  if (requester.role === USER_ROLE.admin || isBuyer) return;

  if (requester.role === USER_ROLE.agent) {
    if (!buyerId) {
      throw new ApiError(
        HttpStatusCode.BadRequest,
        'Order has no customer',
        traceId
      );
    }
    await assertAgentAssignedToCustomer(traceId, requester.userId, buyerId);
    return;
  }

  throw new ApiError(
    HttpStatusCode.Forbidden,
    'You cannot access this order support chat',
    traceId
  );
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

/** Returns whether the user already has a customer support chat. */
export const getUserSupportFlags = async (userId: string) => {
  const chatIds = await getMyParticipantChatIds(userId);
  if (chatIds.length === 0) {
    return { hasCustomerSupport: false };
  }

  const hasCustomerSupport = Boolean(
    await Chat.exists({
      _id: { $in: chatIds },
      type: CHAT_TYPES.customer_support,
      order: null,
    })
  );

  return { hasCustomerSupport };
};

/** Returns whether an order already has an order_support chat. */
export const hasOrderSupportChat = async (orderId: string) =>
  Boolean(
    await Chat.exists({
      order: orderId,
      type: CHAT_TYPES.order_support,
    })
  );

/** Returns whether two users already share a 1:1 chat. */
export const hasSingleChatBetweenUsers = async (
  userIdA?: string | null,
  userIdB?: string | null
) => {
  if (!userIdA || !userIdB || userIdA === userIdB) return false;

  const sharedChatIds = await getSharedChatIds(userIdA, userIdB);
  if (!sharedChatIds.length) return false;

  return Boolean(
    await Chat.exists({
      _id: { $in: sharedChatIds },
      type: CHAT_TYPES.single_chat,
    })
  );
};

/** Throws when requester is not inside the chat participants. */
export const assertChatAccess = async (
  traceId: string,
  chatId: string,
  requester: TChatRequester
) => {
  if (requester.role === USER_ROLE.admin) return;

  if (requester.role === USER_ROLE.agent) {
    const customerId = await getCustomerIdForChat(chatId);
    if (!customerId) {
      throw new ApiError(HttpStatusCode.Forbidden, 'You cannot access this chat', traceId);
    }
    await assertAgentAssignedToCustomer(traceId, requester.userId, customerId);
    return;
  }

  const isParticipant = await isChatParticipant(chatId, requester.userId);
  if (!isParticipant) {
    throw new ApiError(HttpStatusCode.Forbidden, 'You cannot access this chat', traceId);
  }
};

export const chatPopulate = [
  { path: 'order', select: '_id id' },
];

export const attachParticipantsToChat = async (chat: any) => {
  const [chatWithParticipants] = await attachParticipantsToChats([
    chat.toObject ? chat.toObject() : chat,
  ]);
  return chatWithParticipants;
};

const formatChatOrder = (order: any) => {
  if (!order || typeof order !== 'object' || !order._id) return null;
  return { _id: order._id, id: order.id };
};

/** Formats chat participants with user role for inbox/detail responses. */
export const formatChatParticipants = (
  participants: any[] = [],
  options?: { excludeUserId?: string }
) =>
  participants
    .map((participant: any) => {
      const user = participant?.user;
      if (user && typeof user === 'object') {
        return {
          user: {
            _id: user._id,
            name: user.name ?? null,
            profileAvatar: user.profileAvatar ?? null,
            role: user.role ?? null,
          },
        };
      }
      return {
        user: {
          _id: user,
          name: null,
          profileAvatar: null,
          role: null,
        },
      };
    })
    .filter((participant) => {
      if (!options?.excludeUserId) return true;
      return String(participant.user?._id) !== String(options.excludeUserId);
    });

/** Slim last-message preview for inbox cards. */
export const formatChatListLastMessage = (message: any) => {
  if (!message) return null;

  const sender = message.sender;
  return {
    _id: message._id,
    text: message.text ?? null,
    files: message.files ?? [],
    seen: Boolean(message.seen),
    isEdited: Boolean(message.isEdited),
    sender:
      sender && typeof sender === 'object'
        ? {
            _id: sender._id,
            name: sender.name ?? null,
            profileAvatar: sender.profileAvatar ?? null,
          }
        : sender
          ? { _id: sender, name: null, profileAvatar: null }
          : null,
    createdAt: message.createdAt,
  };
};

/** Loads the newest message per chat and returns a chatId → message map. */
export const getLastMessagesByChatIds = async (chatIds: string[]) => {
  const map = new Map<string, ReturnType<typeof formatChatListLastMessage>>();
  if (!chatIds.length) return map;

  const objectIds = chatIds
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));
  if (!objectIds.length) return map;

  const grouped = await Messages.aggregate([
    { $match: { chat: { $in: objectIds } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$chat', messageId: { $first: '$_id' } } },
  ]);

  if (!grouped.length) return map;

  const messages = await Messages.find({
    _id: { $in: grouped.map((row) => row.messageId) },
  })
    .populate({ path: 'sender', select: 'name profileAvatar' })
    .select('_id text files seen isEdited sender chat createdAt')
    .lean();

  for (const message of messages) {
    map.set(String(message.chat), formatChatListLastMessage(message));
  }

  return map;
};

/** Attaches lastMessage onto each chat document. */
export const attachLastMessagesToChats = async <T extends { _id: unknown }>(
  chats: T[]
) => {
  const lastByChatId = await getLastMessagesByChatIds(
    chats.map((chat) => String(chat._id))
  );

  return chats.map((chat) => ({
    ...chat,
    lastMessage: lastByChatId.get(String(chat._id)) ?? null,
  }));
};

/** Slim chat card used by the grouped inbox list. */
export const formatChatListCard = (
  chat: any,
  options?: { excludeUserId?: string }
) => {
  const card: Record<string, unknown> = {
    _id: chat._id,
    type: chat.type,
    order: formatChatOrder(chat.order),
    createdAt: chat.createdAt,
    participants: formatChatParticipants(chat.participants, options),
  };

  if ('lastMessage' in chat) {
    card.lastMessage = chat.lastMessage ?? null;
  }

  return card;
};

/** Chat detail with populated order and participant users. */
export const formatChatDetail = (chat: any) => ({
  ...formatChatListCard(chat),
  participants: formatChatParticipants(chat.participants),
  lastMessage: chat.lastMessage ?? null,
});

/** Participants + lastMessage, then detail shape for GET chat endpoints. */
export const buildChatDetail = async (chat: any) => {
  const withParticipants = await attachParticipantsToChat(chat);
  const [withLastMessage] = await attachLastMessagesToChats([withParticipants]);
  return formatChatDetail(withLastMessage);
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

export const upsertOrderChat = async (orderId: string, type: IChatType) => {
  await ensureChatIndexes();

  return Chat.findOneAndUpdate(
    { order: orderId, type },
    {
      type,
      order: orderId,
      status: CHAT_STATUS.active,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).populate(chatPopulate);
};

export const createAiAssistantChat = async (userId: string) => {
  await ensureChatIndexes();

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
  await ensureChatIndexes();

  const existingChat = await getExistingUserChatByType(userId, type);
  const chat =
    existingChat ||
    (await Chat.create({
      type,
      order: null,
      status: CHAT_STATUS.active,
    }));

  const agentId = await resolveOrAssignAgentForCustomer(userId);
  const participants = agentId ? [userId, agentId] : [userId];
  await syncChatParticipants(chat._id, participants);
  await pruneChatParticipantsExcept(chat._id, participants);

  const populatedChat = await getPopulatedChatById(chat._id);
  return attachParticipantsToChat(populatedChat);
};

export const createOrderSupportChat = async (
  traceId: string,
  requester: TChatRequester,
  orderId: string
) => {
  const order = await getChatOrderOrThrow(traceId, orderId);
  await assertOrderSupportAccess(traceId, order, requester);

  const buyerId = order.user?.toString();
  if (!buyerId) {
    throw new ApiError(HttpStatusCode.BadRequest, 'Order has no customer', traceId);
  }

  const chat = await upsertOrderChat(orderId, CHAT_TYPES.order_support);
  const agentId = await resolveOrAssignAgentForCustomer(buyerId);
  const participants = agentId ? [buyerId, agentId] : [buyerId];
  await syncChatParticipants(chat._id, participants);
  await pruneChatParticipantsExcept(chat._id, participants);
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
  await ensureChatIndexes();

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
