import { HttpStatusCode } from 'axios';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import { CHAT_TYPES, IChatType } from '@/app/modules/chat/chat.constant';
import {
  assertChatAccess,
  assertChatUserExists,
  assertOrderSupportAccess,
  attachLastMessagesToChats,
  buildChatDetail,
  chatPopulate,
  createAgentSupportChat,
  createAiAssistantChat,
  createOrderSupportChat,
  createSingleChat,
  formatChatListCard,
  getChatOrderOrThrow,
  getPayloadParticipantId,
} from '@/app/modules/chat/chat.helpers';
import { Chat } from '@/app/modules/chat/chat.model';
import { TChatRequester, TCreateChatPayload } from '@/app/modules/chat/chat.types';
import {
  attachParticipantsToChats,
  getMyParticipantChatIds,
  getSharedChatIds,
} from '@/app/modules/participant/participant.helpers';
import {
  countOpenGrievancesByCustomerIds,
} from '@/app/modules/supportAssignment/supportAssignment.helpers';
import { SupportAssignment } from '@/app/modules/supportAssignment/supportAssignment.model';
import { getUnreadMessageCountsByChatIds } from '@/app/modules/messages/messages.helpers';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import { User } from '@/app/modules/user/user.model';

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

const getMyChatList = async (
  requester: TChatRequester,
  query: Record<string, unknown> = {}
) => {
  const typeFilter =
    typeof query.type === 'string' && query.type ? query.type : null;

  const chatIds = await getMyParticipantChatIds(requester.userId);
  const baseFilter: Record<string, unknown> = {
    _id: { $in: chatIds },
  };
  if (!typeFilter) {
    baseFilter.type = {
      $nin: [CHAT_TYPES.ai_assistant, CHAT_TYPES.single_chat],
    };
  }

  const queryForBuilder = {
    ...query,
    sort: (query.sort as string) || '-updatedAt',
  };

  const chatQuery = new QueryBuilder(
    Chat.find(baseFilter)
      .populate(chatPopulate)
      .select('_id type order createdAt updatedAt')
      .lean(),
    queryForBuilder
  )
    .filter()
    .sort()
    .paginate();

  const [chats, meta] = await Promise.all([
    chatQuery.modelQuery,
    chatQuery.countTotal(),
  ]);

  const chatsWithParticipants = await attachParticipantsToChats(chats);
  const chatsWithLastMessage = await attachLastMessagesToChats(
    chatsWithParticipants
  );
  const unreadCounts = await getUnreadMessageCountsByChatIds(
    requester.userId,
    chatsWithLastMessage.map((chat) => String(chat._id))
  );
  const listOptions = { excludeUserId: requester.userId };

  const ofType = (type: IChatType) =>
    chatsWithLastMessage
      .filter((chat) => chat.type === type)
      .map((chat) =>
        formatChatListCard(
          {
            ...chat,
            unreadMessageCount: unreadCounts.get(String(chat._id)) ?? 0,
          },
          listOptions
        )
      );

  if (typeFilter) {
    return {
      meta,
      data: {
        type: typeFilter,
        chats: ofType(typeFilter as IChatType),
      },
    };
  }

  return {
    meta,
    data: {
      customer_support: ofType(CHAT_TYPES.customer_support),
      order_support: ofType(CHAT_TYPES.order_support),
    },
  };
};

const getOrCreateAiAssistantChat = async (userId: string) =>
  createAiAssistantChat(userId);

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
  return buildChatDetail(chat);
};

const getChatOrderById = async (
  traceId: string,
  requester: TChatRequester,
  orderId: string
) => {
  const order = await getChatOrderOrThrow(traceId, orderId);
  await assertOrderSupportAccess(traceId, order, requester);

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
  return buildChatDetail(chat);
};

const getChatByUserId = async (
  traceId: string,
  requester: TChatRequester,
  userId: string
) => {
  if (requester.userId === userId) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Cannot get a chat with yourself',
      traceId
    );
  }

  await assertChatUserExists(traceId, userId);

  const sharedChatIds = await getSharedChatIds(requester.userId, userId);
  if (!sharedChatIds.length) {
    throw new ApiError(HttpStatusCode.NotFound, 'Chat not found', traceId);
  }

  const chat =
    (await Chat.findOne({
      _id: { $in: sharedChatIds },
      type: CHAT_TYPES.single_chat,
    })
      .sort({ updatedAt: -1 })
      .populate(chatPopulate)
      .select('-__v')) ||
    (await Chat.findOne({
      _id: { $in: sharedChatIds },
      type: { $ne: CHAT_TYPES.ai_assistant },
    })
      .sort({ updatedAt: -1 })
      .populate(chatPopulate)
      .select('-__v'));

  if (!chat) {
    throw new ApiError(HttpStatusCode.NotFound, 'Chat not found', traceId);
  }

  return buildChatDetail(chat);
};

const getAgentCustomers = async (traceId: string, requester: TChatRequester) => {
  if (requester.role !== USER_ROLE.agent) {
    throw new ApiError(HttpStatusCode.Forbidden, 'Only agents can access this', traceId);
  }

  const assignments = await SupportAssignment.find({ agent: requester.userId })
    .select('customer createdAt')
    .lean();
  const customerIds = assignments.map((row) => String(row.customer));
  if (!customerIds.length) return { customers: [] };

  const [customers, grievanceCounts] = await Promise.all([
    User.find({ _id: { $in: customerIds }, isDeleted: false })
      .select('name profileAvatar phone')
      .lean(),
    countOpenGrievancesByCustomerIds(customerIds),
  ]);

  const customerMap = new Map(customers.map((user) => [String(user._id), user]));
  const chatIds = await getMyParticipantChatIds(requester.userId);
  const supportChats = await Chat.find({
    _id: { $in: chatIds },
    type: { $in: [CHAT_TYPES.customer_support, CHAT_TYPES.order_support] },
  })
    .populate(chatPopulate)
    .select('_id type order createdAt updatedAt')
    .lean();

  const chatsWithMeta = await attachLastMessagesToChats(
    await attachParticipantsToChats(supportChats)
  );

  const chatsByCustomer = new Map<string, ReturnType<typeof formatChatListCard>[]>();
  for (const chat of chatsWithMeta) {
    const participants = (chat as any).participants ?? [];
    const customerParticipant = participants.find(
      (row: any) => String(row?.user?._id ?? row?.user) !== requester.userId
    );
    const customerId = String(
      customerParticipant?.user?._id ?? customerParticipant?.user ?? ''
    );
    if (!customerId || !customerIds.includes(customerId)) continue;

    const card = formatChatListCard(chat, { excludeUserId: requester.userId });
    const existing = chatsByCustomer.get(customerId) ?? [];
    chatsByCustomer.set(customerId, [...existing, card]);
  }

  const grouped = assignments
    .map((assignment) => {
      const customerId = String(assignment.customer);
      const customer = customerMap.get(customerId);
      if (!customer) return null;

      const chats = chatsByCustomer.get(customerId) ?? [];
      const lastMessageAt = chats.reduce<string | null>((latest, chat) => {
        const createdAt = (chat as any).lastMessage?.createdAt;
        if (!createdAt) return latest;
        if (!latest || new Date(createdAt) > new Date(latest)) {
          return String(createdAt);
        }
        return latest;
      }, null);

      return {
        customer: {
          _id: customer._id,
          name: customer.name ?? null,
          profileAvatar: customer.profileAvatar ?? null,
          phone: customer.phone ?? null,
        },
        assignedAt: assignment.createdAt,
        openGrievanceCount: grievanceCounts.get(customerId) ?? 0,
        openChatCount: chats.length,
        lastMessageAt,
        chats,
      };
    })
    .filter(Boolean);

  return { customers: grouped };
};

export const ChatService = {
  createChat,
  getMyChatList,
  getChatId,
  getChatOrderById,
  getChatByUserId,
  getOrCreateAiAssistantChat,
  resolveChatIdForSend,
  getAgentCustomers,
};
