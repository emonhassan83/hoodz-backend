import { messaging } from '@/app/configs/firebase.configs';
import { User } from '@/app/modules/user/user.model';

type TPushPayload = {
  message: string;
  description?: string;
  data?: Record<string, any>;
};

const normalizeData = (data?: Record<string, any>) => {
  if (!data) return undefined;

  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      typeof value === 'string' ? value : JSON.stringify(value),
    ])
  );
};

const removeInvalidTokens = async (
  tokens: string[],
  responses?: Array<{ success: boolean; error?: { code?: string } }>
) => {
  if (!responses?.length) return;

  const invalidTokens = responses
    .map((response, index) => {
      if (
        !response.success &&
        (response.error?.code === 'messaging/registration-token-not-registered' ||
          response.error?.code === 'messaging/invalid-registration-token')
      ) {
        return tokens[index];
      }

      return null;
    })
    .filter((token): token is string => Boolean(token));

  if (invalidTokens.length > 0) {
    await User.updateMany(
      { fcmToken: { $in: invalidTokens } },
      { $unset: { fcmToken: '' } }
    );
  }
};

export const sendNotification = async (
  fcmTokens: string[],
  payload: TPushPayload
) => {
  const tokens = [...new Set(fcmTokens.filter(Boolean))];

  if (tokens.length === 0) {
    return { successCount: 0, failureCount: 0, responses: [] };
  }

  const multicastMessage = {
    tokens,
    notification: {
      title: payload.message,
      body: payload.description ?? '',
    },
    data: normalizeData(payload.data),
    android: {
      priority: 'high' as const,
      notification: {
        sound: 'default',
      },
    },
    apns: {
      headers: {
        'apns-push-type': 'alert',
      },
      payload: {
        aps: {
          badge: 1,
          sound: 'default',
        },
      },
    },
  };

  const response =
    typeof messaging.sendEachForMulticast === 'function'
      ? await messaging.sendEachForMulticast(multicastMessage)
      : await messaging.sendEach(
          tokens.map((token) => ({
            token,
            notification: multicastMessage.notification,
            data: multicastMessage.data,
            android: multicastMessage.android,
            apns: multicastMessage.apns,
          }))
        );

  await removeInvalidTokens(tokens, response.responses);
  return response;
};

