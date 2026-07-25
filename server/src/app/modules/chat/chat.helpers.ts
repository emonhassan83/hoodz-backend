import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { Orders } from '@/app/modules/orders/orders.model';
import { isChatParticipant } from '@/app/modules/participant/participant.helpers';
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

/** Returns an order if requester can open an order-support chat for it. */
export const getChatOrderOrThrow = async (
  traceId: string,
  orderId: string,
  requester: { userId: string; role: string }
) => {
  const order = await Orders.findOne({ _id: orderId, isDeleted: false });
  if (!order) {
    throw new ApiError(HttpStatusCode.NotFound, 'Order not found', traceId);
  }

  const isAdmin = requester.role === USER_ROLE.admin;
  const isBuyer = order.user?.toString() === requester.userId;
  const isVendor = order.author.toString() === requester.userId;

  if (!isAdmin && !isBuyer && !isVendor) {
    throw new ApiError(HttpStatusCode.Forbidden, 'You cannot access this order chat', traceId);
  }

  return order;
};

/** Throws when requester is not inside the chat participants. */
export const assertChatAccess = async (
  traceId: string,
  chatId: string,
  requester: { userId: string; role: string }
) => {
  const isAdmin = requester.role === USER_ROLE.admin;
  const isParticipant = await isChatParticipant(chatId, requester.userId);

  if (!isAdmin && !isParticipant) {
    throw new ApiError(HttpStatusCode.Forbidden, 'You cannot access this chat', traceId);
  }
};

