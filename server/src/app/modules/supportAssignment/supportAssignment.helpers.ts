import { HttpStatusCode } from 'axios';
import { Types } from 'mongoose';

import ApiError from '@/app/errors/ApiError';
import { CHAT_TYPES } from '@/app/modules/chat/chat.constant';
import { Chat } from '@/app/modules/chat/chat.model';
import { GRIEVANCE_STATUS } from '@/app/modules/grievance/grievance.constant';
import { Grievance } from '@/app/modules/grievance/grievance.model';
import { Orders } from '@/app/modules/orders/orders.model';
import {
  getMyParticipantChatIds,
  pruneChatParticipantsExcept,
  syncChatParticipants,
} from '@/app/modules/participant/participant.helpers';
import { Participant } from '@/app/modules/participant/participant.model';
import { SupportAssignment } from '@/app/modules/supportAssignment/supportAssignment.model';
import { USER_ROLE, USER_STATUS } from '@/app/modules/user/user.constant';
import { isAgentOnSchedule } from '@/app/modules/user/user.helpers';
import { User } from '@/app/modules/user/user.model';

const SUPPORT_CHAT_TYPES = [CHAT_TYPES.customer_support, CHAT_TYPES.order_support];

const toIdString = (value: unknown) =>
  String((value as { _id?: unknown })?._id ?? value ?? '').trim();

/** Returns the assigned agent id for a customer, if any. */
export const getAssignedAgentId = async (customerId: string) => {
  const row = await SupportAssignment.findOne({ customer: customerId })
    .select('agent')
    .lean();
  return row?.agent ? toIdString(row.agent) : null;
};

/** Returns customer ids assigned to an agent. */
export const getAssignedCustomerIds = async (agentId: string) => {
  const rows = await SupportAssignment.find({ agent: agentId }).select('customer').lean();
  return rows.map((row) => toIdString(row.customer));
};

/** Active agents currently inside their daily schedule window. */
export const getAgentsOnSchedule = async () => {
  const agents = await User.find({
    role: USER_ROLE.agent,
    status: USER_STATUS.active,
    isDeleted: false,
    'agentSchedule.startTime': { $ne: null },
    'agentSchedule.endTime': { $ne: null },
  })
    .select('_id agentSchedule timeZone')
    .lean();

  return agents.filter((agent) => isAgentOnSchedule(agent));
};

/** Picks the on-schedule agent with the fewest assigned customers. */
export const pickLeastLoadedOnScheduleAgent = async () => {
  const agents = await getAgentsOnSchedule();
  if (!agents.length) return null;

  const counts = await SupportAssignment.aggregate<{ _id: Types.ObjectId; total: number }>([
    { $match: { agent: { $ne: null } } },
    { $group: { _id: '$agent', total: { $sum: 1 } } },
  ]);
  const countByAgent = new Map(counts.map((row) => [toIdString(row._id), row.total]));

  const sorted = [...agents].sort(
    (a, b) =>
      (countByAgent.get(toIdString(a._id)) ?? 0) -
      (countByAgent.get(toIdString(b._id)) ?? 0)
  );

  return toIdString(sorted[0]._id);
};

/** Resolves sticky assignment or auto-assigns when an on-schedule agent exists. */
export const resolveOrAssignAgentForCustomer = async (customerId: string) => {
  const existing = await SupportAssignment.findOne({ customer: customerId }).lean();
  if (existing?.agent) {
    return toIdString(existing.agent);
  }

  const agentId = await pickLeastLoadedOnScheduleAgent();
  const assignment = await SupportAssignment.findOneAndUpdate(
    { customer: customerId },
    { $set: { customer: customerId, ...(agentId ? { agent: agentId } : {}) } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  const resolvedAgentId = assignment?.agent ? toIdString(assignment.agent) : agentId;
  if (resolvedAgentId) {
    await attachAgentToCustomerSupportChats(customerId, resolvedAgentId);
  }

  return resolvedAgentId;
};

/** Adds agent to all support chats for a customer and removes other agents. */
export const attachAgentToCustomerSupportChats = async (
  customerId: string,
  agentId: string
) => {
  const chatIds = await getMyParticipantChatIds(customerId);
  if (!chatIds.length) return;

  const supportChats = await Chat.find({
    _id: { $in: chatIds },
    type: { $in: SUPPORT_CHAT_TYPES },
  })
    .select('_id')
    .lean();

  await Promise.all(
    supportChats.map(async (chat) => {
      await syncChatParticipants(chat._id, [customerId, agentId]);
      await pruneChatParticipantsExcept(chat._id, [customerId, agentId]);
    })
  );
};

/** Resolves the buyer/customer id for a support chat. */
export const getCustomerIdForChat = async (chatId: string) => {
  const chat = await Chat.findById(chatId).select('type order').lean();
  if (!chat) return null;

  if (chat.type === CHAT_TYPES.order_support && chat.order) {
    const order = await Orders.findById(chat.order).select('user').lean();
    return order?.user ? toIdString(order.user) : null;
  }

  if (chat.type === CHAT_TYPES.customer_support) {
    const participants = await Participant.find({ chat: chatId })
      .populate({ path: 'user', select: 'role' })
      .select('user')
      .lean();

    const customer = participants.find(
      (row) => (row.user as { role?: string })?.role === USER_ROLE.user
    );
    if (customer?.user) return toIdString(customer.user);

    const nonAgent = participants.find(
      (row) => (row.user as { role?: string })?.role !== USER_ROLE.agent
    );
    return nonAgent?.user ? toIdString(nonAgent.user) : null;
  }

  return null;
};

/** Ensures an agent is the assigned handler for a support customer. */
export const assertAgentAssignedToCustomer = async (
  traceId: string,
  agentId: string,
  customerId: string
) => {
  const assigned = await getAssignedAgentId(customerId);
  if (assigned !== agentId) {
    throw new ApiError(
      HttpStatusCode.Forbidden,
      'You are not assigned to this customer',
      traceId
    );
  }
};

/** Assigns pending customers when agents come on schedule. */
export const assignPendingSupportCustomers = async () => {
  const pending = await SupportAssignment.find({ agent: null }).select('customer').lean();
  if (!pending.length) return { assigned: 0, scanned: 0 };

  let assigned = 0;
  for (const row of pending) {
    const customerId = toIdString(row.customer);
    const agentId = await pickLeastLoadedOnScheduleAgent();
    if (!agentId) break;

    await SupportAssignment.updateOne(
      { customer: row.customer, agent: null },
      { agent: agentId }
    );
    await attachAgentToCustomerSupportChats(customerId, agentId);
    assigned += 1;
  }

  return { assigned, scanned: pending.length };
};

/** Backfills assignments and prunes legacy broadcast agent participants. */
export const backfillSupportAssignmentsFromChats = async () => {
  const supportChats = await Chat.find({
    type: { $in: SUPPORT_CHAT_TYPES },
  })
    .select('_id type order')
    .lean();

  let processed = 0;
  for (const chat of supportChats) {
    const customerId = await getCustomerIdForChat(String(chat._id));
    if (!customerId) continue;

    let assignment = await SupportAssignment.findOne({ customer: customerId });
    if (!assignment) {
      const agentId = await pickLeastLoadedOnScheduleAgent();
      assignment = await SupportAssignment.create({
        customer: customerId,
        agent: agentId,
      });
    }

    const agentId = assignment.agent ? toIdString(assignment.agent) : null;
    const allowed = agentId ? [customerId, agentId] : [customerId];
    await syncChatParticipants(chat._id, allowed);
    await pruneChatParticipantsExcept(chat._id, allowed);
    processed += 1;
  }

  return { processed };
};

/** Open grievance count per customer for an agent inbox. */
export const countOpenGrievancesByCustomerIds = async (customerIds: string[]) => {
  if (!customerIds.length) return new Map<string, number>();

  const rows = await Grievance.aggregate<{ _id: Types.ObjectId; total: number }>([
    {
      $match: {
        user: {
          $in: customerIds.map((id) => new Types.ObjectId(id)),
        },
        status: GRIEVANCE_STATUS.under_review,
      },
    },
    { $group: { _id: '$user', total: { $sum: 1 } } },
  ]);

  return new Map(rows.map((row) => [toIdString(row._id), row.total]));
};
