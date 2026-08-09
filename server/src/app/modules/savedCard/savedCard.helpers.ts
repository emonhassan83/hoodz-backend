import { HttpStatusCode } from 'axios';
import crypto from 'node:crypto';

import { env } from '@/app/configs/env.configs';
import ApiError from '@/app/errors/ApiError';
import { TSavedCardWebhookData } from '@/app/modules/savedCard/savedCard.types';

const ALGORITHM = 'aes-256-gcm';

const getEncryptionKey = (traceId: string) => {
  if (!env.SAVED_CARD_ENCRYPTION_KEY) {
    throw new ApiError(
      HttpStatusCode.InternalServerError,
      'Saved card encryption key is missing',
      traceId
    );
  }

  return crypto
    .createHash('sha256')
    .update(env.SAVED_CARD_ENCRYPTION_KEY)
    .digest();
};

/** Encrypts Paymob card token before writing it to MongoDB. */
export const encryptCardToken = (token: string, traceId: string) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(traceId), iv);
  const encrypted = Buffer.concat([
    cipher.update(token, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
};

/** Decrypts a stored Paymob card token for saved-card payment. */
export const decryptCardToken = (encryptedToken: string, traceId: string) => {
  const [iv, authTag, encrypted] = encryptedToken.split(':');
  if (!iv || !authTag || !encrypted) {
    throw new ApiError(
      HttpStatusCode.InternalServerError,
      'Saved card token format is invalid',
      traceId
    );
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getEncryptionKey(traceId),
    Buffer.from(iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64')),
    decipher.final(),
  ]).toString('utf8');
};

/** Hashes card token for duplicate detection without revealing the token. */
export const hashCardToken = (token: string, traceId: string) => {
  if (!env.SAVED_CARD_HASH_SECRET) {
    throw new ApiError(
      HttpStatusCode.InternalServerError,
      'Saved card hash secret is missing',
      traceId
    );
  }

  return crypto
    .createHmac('sha256', env.SAVED_CARD_HASH_SECRET)
    .update(token)
    .digest('hex');
};

/** Pulls saved-card metadata from Paymob transaction webhook shape. */
export const extractSavedCardWebhookData = (
  transaction: Record<string, any>
): TSavedCardWebhookData => {
  const maskedPan =
    transaction?.data?.card_num ??
    transaction?.source_data?.pan ??
    transaction?.source_data?.card_num;
  const last4 = maskedPan ? String(maskedPan).replace(/\D/g, '').slice(-4) : undefined;

  return {
    token: transaction?.token,
    maskedPan,
    last4,
    cardBrand:
      transaction?.data?.card_type ??
      transaction?.source_data?.sub_type ??
      transaction?.source_data?.type,
    cardSubType: transaction?.data?.sub_type ?? transaction?.source_data?.sub_type,
  };
};

/** Resolves the Paymob order id from supported webhook payload shapes. */
export const resolvePaymobOrderId = (transaction: Record<string, any>) => {
  if (typeof transaction?.order === 'object' && transaction.order?.id) {
    return String(transaction.order.id);
  }

  if (transaction?.order) return String(transaction.order);
  return undefined;
};

/** Resolves a redirect URL from Paymob saved-card charge response. */
export const resolvePaymobRedirectUrl = (response: Record<string, any>) =>
  response?.redirect_url ??
  response?.iframe_redirection_url ??
  response?.redirection_url ??
  response?.data?.redirect_url ??
  null;
