import axios from 'axios';
import { HttpStatusCode } from 'axios';

import { env } from '@/app/configs/env.configs';
import ApiError from '@/app/errors/ApiError';

const fetchVodafoneToken = async (traceId: string) => {
  if (!env.VODAFONE_SMS_TOKEN_URL) return null;
  try {
    const resp = await axios.post(
      env.VODAFONE_SMS_TOKEN_URL,
      {
        client_id: env.VODAFONE_SMS_CLIENT_ID,
        client_secret: env.VODAFONE_SMS_CLIENT_SECRET,
      },
      { timeout: env.VODAFONE_SMS_TIMEOUT_MS ?? 10000 }
    );
    return resp.data?.access_token || resp.data?.token || null;
  } catch (error) {
    console.error(`[${traceId}] Vodafone token fetch error:`, error);
    return null;
  }
};

export const sendSmsViaVodafone = async (
  to: string,
  message: string,
  traceId: string
) => {
  if (!env.VODAFONE_SMS_SEND_URL) {
    throw new ApiError(
      HttpStatusCode.InternalServerError,
      'SMS provider is not configured',
      traceId
    );
  }

  const token = await fetchVodafoneToken(traceId);

  const bodyCandidates = [
    { sender: env.VODAFONE_SMS_SENDER_ID, recipients: [to], text: message },
    { from: env.VODAFONE_SMS_SENDER_ID, to, message: message },
    { sender: env.VODAFONE_SMS_SENDER_ID, recipient: to, message: message },
  ];

  let lastError: any = null;
  for (const body of bodyCandidates) {
    try {
      await axios.post(env.VODAFONE_SMS_SEND_URL as string, body, {
        headers: token
          ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
          : { 'Content-Type': 'application/json' },
        timeout: env.VODAFONE_SMS_TIMEOUT_MS ?? 10000,
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }

  console.error(`[${traceId}] Vodafone SMS send error:`, lastError);
  throw new ApiError(
    HttpStatusCode.InternalServerError,
    'Failed to send SMS via Vodafone provider',
    traceId
  );
};

export default sendSmsViaVodafone;
