import { Types } from 'mongoose';

import { IChatType } from '@/app/modules/chat/chat.constant';
import { PARTICIPANT_STATUS } from '@/app/modules/participant/participant.constant';
import { Participant } from '@/app/modules/participant/participant.model';

/** Ensures all users are participant rows of a chat. */
export const syncChatParticipants = async (
  chatId: Types.ObjectId | string,
  userIds: string[]
) => {
  const uniqueUserIds = [...new Set(userIds)];

  await Promise.all(
    uniqueUserIds.map((userId) =>
      Participant.updateOne(
        { chat: chatId, user: userId },
        { chat: chatId, user: userId, status: PARTICIPANT_STATUS.active },
        { upsert: true }
      )
    )
  );
};

/** Returns chat ids where the user is an active participant. */
export const getMyParticipantChatIds = async (userId: string) => {
  const participants = await Participant.find({
    user: userId,
    status: PARTICIPANT_STATUS.active,
  })
    .select('chat -_id')
    .lean();

  return participants.map((participant) => participant.chat);
};

/** Returns chat ids where both users are active participants. */
export const getSharedChatIds = async (userId: string, otherUserId: string) => {
  const myChatIds = await getMyParticipantChatIds(userId);
  if (myChatIds.length === 0) return [];

  const shared = await Participant.find({
    user: otherUserId,
    chat: { $in: myChatIds },
    status: PARTICIPANT_STATUS.active,
  })
    .select('chat -_id')
    .lean();

  return shared.map((item) => item.chat);
};

/** Checks whether a user belongs to a chat. */
export const isChatParticipant = async (chatId: string, userId: string) => {
  const participant = await Participant.exists({
    chat: chatId,
    user: userId,
    status: PARTICIPANT_STATUS.active,
  });

  return Boolean(participant);
};

/** Finds an existing chat of a type where the user is a participant. */
export const findUserChatByType = async (
  userId: string,
  type: IChatType
) => {
  const participant = await Participant.findOne({
    user: userId,
    status: PARTICIPANT_STATUS.active,
  })
    .populate({
      path: 'chat',
      match: { type },
      select: '_id type order status createdAt updatedAt',
    })
    .select('chat')
    .lean();

  return participant?.chat || null;
};

/** Loads populated participant users for a list of chats. */
export const getParticipantsByChatIds = async (chatIds: string[]) => {
  const participants = await Participant.find({
    chat: { $in: chatIds },
    status: PARTICIPANT_STATUS.active,
  })
    .populate([{ path: 'user', select: 'name profileAvatar role' }])
    .select('chat user')
    .lean();

  return participants.reduce<Map<string, typeof participants>>((map, item) => {
    const chatId = item.chat.toString();
    const current = map.get(chatId) ?? [];
    map.set(chatId, [...current, item]);
    return map;
  }, new Map<string, typeof participants>());
};

/** Adds participant rows to chat payloads. */
export const attachParticipantsToChats = async <T extends { _id: unknown }>(
  chats: T[]
) => {
  const participantByChatId = await getParticipantsByChatIds(
    chats.map((chat) => String(chat._id))
  );

  return chats.map((chat) => ({
    ...chat,
    participants: participantByChatId.get(String(chat._id)) ?? [],
  }));
};


