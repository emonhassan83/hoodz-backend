import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { IOrders } from '@/app/modules/orders/orders.interface';
import { Orders } from '@/app/modules/orders/orders.model';
import { isChatParticipant } from '@/app/modules/participant/participant.helpers';
import { USER_ROLE, USER_STATUS } from '@/app/modules/user/user.constant';
import { User } from '@/app/modules/user/user.model';

type TChatRequester = { userId: string; role: string };

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
