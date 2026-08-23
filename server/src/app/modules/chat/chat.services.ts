import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { CHAT_TYPES, IChatType } from '@/app/modules/chat/chat.constant';
import {
  assertChatAccess,
  assertChatUserExists,
  assertOrderSupportAccess,
  assertStaffSupportCreateAccess,
  attachParticipantsToChat,
  chatPopulate,
  createAgentSupportChat,
  createAiAssistantChat,
  createOrderSupportChat,
  createSingleChat,
  getChatOrderOrThrow,
  getPayloadParticipantId,
} from '@/app/modules/chat/chat.helpers';
import { Chat } from '@/app/modules/chat/chat.model';
import { TChatRequester, TCreateChatPayload } from '@/app/modules/chat/chat.types';
import {
  attachParticipantsToChats,
  getMyParticipantChatIds,
} from '@/app/modules/participant/participant.helpers';
import { USER_ROLE } from '@/app/modules/user/user.constant';

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
  return attachParticipantsToChat(chat);
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
