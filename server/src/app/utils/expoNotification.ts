import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';

import { User } from '@/app/modules/user/user.model';

const expo = new Expo();

interface ISendPushNotificationArgs {
  userIds: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Removes invalid Expo push tokens from user documents.
 * @param tickets - The array of push tickets returned by Expo.
 * @param messages - The original messages sent to Expo.
 */
async function handleInvalidTokens(
  tickets: ExpoPushTicket[],
  messages: ExpoPushMessage[],
): Promise<void> {
  const tokensToRemove: string[] = [];

  tickets.forEach((ticket, i) => {
    if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
      const badToken = messages[i].to as string;
      if (badToken) {
        tokensToRemove.push(badToken);
      }
    }
  });

  if (tokensToRemove.length > 0) {
    await User.updateMany(
      { fcmToken: { $in: tokensToRemove } },
      { $unset: { fcmToken: '' } },
    );
  }
}

/**
 * Sends push notifications to multiple users using Expo.
 * @param args - The arguments for sending push notifications.
 * @returns An array of push tickets from Expo.
 */
export const sendPushNotification = async (
  args: ISendPushNotificationArgs,
): Promise<ExpoPushTicket[]> => {
  const { userIds, title, body, data = {} } = args;

  const users = await User.find({
    _id: { $in: userIds },
    fcmToken: { $exists: true, $ne: null },
  }).select('fcmToken');

  const messages: ExpoPushMessage[] = [];
  for (const user of users) {
    if (user.fcmToken && Expo.isExpoPushToken(user.fcmToken)) {
      messages.push({
        to: user.fcmToken,
        sound: 'default',
        title,
        body,
        data,
        priority: 'high',
      });
    }
  }

  if (messages.length === 0) {
    return [];
  }

  const chunks = expo.chunkPushNotifications(messages);
  const tickets: ExpoPushTicket[] = [];

  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    } catch (error) {
      // In a real app, you'd want to log this error properly.
      // For example, using a logger service with a traceId.
      console.error('Error sending push notification chunk:', error);
    }
  }

  // Asynchronously handle invalid tokens without blocking the response
  handleInvalidTokens(tickets, messages).catch(error => {
    console.error('Error handling invalid push tokens:', error);
  });

  return tickets;
};