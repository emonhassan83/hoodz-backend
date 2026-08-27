import { HttpStatusCode } from 'axios';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import { CHAT_TYPES, IChatType } from '@/app/modules/chat/chat.constant';
import {
  assertChatAccess,
  assertChatUserExists,
  assertOrderSupportAccess,
  assertStaffSupportCreateAccess,
  attachLastMessagesToChats,
  attachParticipantsToChat,
  chatPopulate,
  createAgentSupportChat,
  createAiAssistantChat,
  createOrderSupportChat,
  createSingleChat,
  formatChatDetail,
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
  const listOptions = { excludeUserId: requester.userId };

  const ofType = (type: IChatType) =>
    chatsWithLastMessage
      .filter((chat) => chat.type === type)
      .map((chat) => formatChatListCard(chat, listOptions));

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
      staff_support: ofType(CHAT_TYPES.staff_support),
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
  return formatChatDetail(await attachParticipantsToChat(chat));
};

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
  return formatChatDetail(await attachParticipantsToChat(chat));
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

  return formatChatDetail(await attachParticipantsToChat(chat));
};

export const ChatService = {
  createChat,
  getMyChatList,
  getChatId,
  getChatOrderById,
  getChatByUserId,
  getOrCreateAiAssistantChat,
  resolveChatIdForSend,
};
