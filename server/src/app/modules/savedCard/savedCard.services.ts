import { HttpStatusCode } from 'axios';

import { env } from '@/app/configs/env.configs';
import ApiError from '@/app/errors/ApiError';
import {
  assertPaymobConfig,
  buildPaymobBillingData,
  buildPaymobIframeUrl,
  buildPaymobReturnUrl,
  createPaymobOrder,
  createPaymobPaymentKey,
  getPaymobAuthToken,
  resolvePaymentStatusFromPaymob,
  toPaymobCents,
} from '@/app/modules/payment/payment.helpers';
import { PAYMENT_STATUS } from '@/app/modules/payment/payment.constant';
import { SAVED_CARD_SETUP_STATUS } from '@/app/modules/savedCard/savedCard.constant';
import {
  encryptCardToken,
  extractSavedCardWebhookData,
  hashCardToken,
  resolvePaymobMerchantOrderId,
  resolvePaymobOrderId,
} from '@/app/modules/savedCard/savedCard.helpers';
import {
  SavedCard,
  SavedCardSetupSession,
} from '@/app/modules/savedCard/savedCard.model';
import { TSetupSavedCardPayload } from '@/app/modules/savedCard/savedCard.types';
import { User } from '@/app/modules/user/user.model';

const publicCardSelect = '-paymobCardToken -tokenHash -__v';

const getSetupAmountCents = () =>
  Number(env.PAYMOB_CARD_SETUP_AMOUNT_CENTS ?? 100);

/** Starts a Paymob tokenization setup session before checkout. */
const setupSavedCard = async (
  traceId: string,
  userId: string,
  payload: TSetupSavedCardPayload = {}
) => {
  assertPaymobConfig(traceId);

  const user = await User.findById(userId).select('name email phone address');
  if (!user) {
    throw new ApiError(HttpStatusCode.NotFound, 'User not found', traceId);
  }

  const setupSession = await SavedCardSetupSession.create({
    user: userId,
    merchantOrderId: `SC-PENDING-${Date.now()}`,
    setDefault: payload.setDefault ?? false,
  });

  setupSession.merchantOrderId = `SC-${setupSession._id.toString()}-${Date.now()}`;
  await setupSession.save();

  const amountCents = getSetupAmountCents();
  const authToken = await getPaymobAuthToken();
  const paymobOrder = await createPaymobOrder(
    authToken,
    setupSession.merchantOrderId,
    amountCents
  );
  const paymentKey = await createPaymobPaymentKey(
    authToken,
    amountCents,
    paymobOrder.id,
    buildPaymobBillingData({
      name: user.name,
      email: user.email,
      phoneNumber: user.phone,
      address: user.address,
      country: 'Egypt',
    }),
    { tokenization: true }
  );

  setupSession.paymobOrderId = String(paymobOrder.id);
  await setupSession.save();

  return {
    setupId: setupSession._id,
    setupUrl: buildPaymobIframeUrl(paymentKey),
    returnUrl: buildPaymobReturnUrl(),
  };
};

/** Returns non-deleted saved cards for the logged-in user. */
const getMyCards = async (userId: string) =>
  SavedCard.find({ user: userId, isDeleted: false })
    .sort({ isDefault: -1, createdAt: -1 })
    .select(publicCardSelect)
    .lean();

/** Saves or updates a Paymob card token after a successful webhook. */
const saveCardFromPaymobTransaction = async (
  traceId: string,
  userId: string,
  transaction: Record<string, any>,
  setDefault = false
) => {
  const cardData = extractSavedCardWebhookData(transaction);
  if (!cardData.token || !cardData.maskedPan || !cardData.last4 || !cardData.cardBrand) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Paymob webhook does not include saved card token data',
      traceId
    );
  }

  const tokenHash = hashCardToken(cardData.token, traceId);
  const hasDefault = await SavedCard.exists({
    user: userId,
    isDefault: true,
    isDeleted: false,
  });
  const shouldBeDefault = setDefault || !hasDefault;

  if (shouldBeDefault) {
    await SavedCard.updateMany(
      { user: userId, isDeleted: false },
      { isDefault: false }
    );
  }

  const savedCard = await SavedCard.findOneAndUpdate(
    { user: userId, tokenHash, isDeleted: false },
    {
      user: userId,
      paymobCardToken: encryptCardToken(cardData.token, traceId),
      tokenHash,
      maskedPan: cardData.maskedPan,
      last4: cardData.last4,
      cardBrand: cardData.cardBrand,
      cardSubType: cardData.cardSubType ?? null,
      isDefault: shouldBeDefault,
      isDeleted: false,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).select(publicCardSelect);

  return savedCard;
};

/** Handles Paymob webhook for saved-card setup sessions. */
const processSetupWebhook = async (
  traceId: string,
  transaction: Record<string, any>
) => {
  const paymobOrderId = resolvePaymobOrderId(transaction);
  const merchantOrderId = resolvePaymobMerchantOrderId(transaction);
  if (!paymobOrderId && !merchantOrderId) return null;

  const setupSession = await SavedCardSetupSession.findOne({
    $or: [
      ...(paymobOrderId ? [{ paymobOrderId }] : []),
      ...(merchantOrderId ? [{ merchantOrderId }] : []),
    ],
  });
  if (!setupSession) return null;

  const status = resolvePaymentStatusFromPaymob(transaction);
  if (status !== PAYMENT_STATUS.paid) {
    setupSession.status = SAVED_CARD_SETUP_STATUS.failed;
    setupSession.failureReason = 'Paymob setup payment failed';
    await setupSession.save();
    return { handled: true, setupId: setupSession._id, status: setupSession.status };
  }

  try {
    const savedCard = await saveCardFromPaymobTransaction(
      traceId,
      setupSession.user.toString(),
      transaction,
      setupSession.setDefault
    );
    setupSession.status = SAVED_CARD_SETUP_STATUS.completed;
    setupSession.savedCard = savedCard._id;
    setupSession.failureReason = null;
    await setupSession.save();

    return {
      handled: true,
      setupId: setupSession._id,
      status: setupSession.status,
      savedCardId: savedCard._id,
    };
  } catch (error) {
    setupSession.status = SAVED_CARD_SETUP_STATUS.failed;
    setupSession.failureReason =
      error instanceof Error ? error.message : 'Saved card setup failed';
    await setupSession.save();

    if (
      error instanceof ApiError &&
      error.message === 'Paymob webhook does not include saved card token data'
    ) {
      return {
        handled: true,
        setupId: setupSession._id,
        status: setupSession.status,
        failureReason: setupSession.failureReason,
      };
    }

    throw error;
  }
};

/** Makes one card default and clears previous default for the same user. */
const setDefaultCard = async (
  traceId: string,
  userId: string,
  cardId: string
) => {
  const card = await SavedCard.findOne({
    _id: cardId,
    user: userId,
    isDeleted: false,
  });
  if (!card) {
    throw new ApiError(HttpStatusCode.NotFound, 'Saved card not found', traceId);
  }

  await SavedCard.updateMany(
    { user: userId, isDeleted: false },
    { isDefault: false }
  );
  card.isDefault = true;
  await card.save();

  return SavedCard.findById(card._id).select(publicCardSelect);
};

/** Soft deletes a saved card and promotes another card if needed. */
const deleteCard = async (traceId: string, userId: string, cardId: string) => {
  const card = await SavedCard.findOne({
    _id: cardId,
    user: userId,
    isDeleted: false,
  });
  if (!card) {
    throw new ApiError(HttpStatusCode.NotFound, 'Saved card not found', traceId);
  }

  const wasDefault = card.isDefault;
  card.isDeleted = true;
  card.isDefault = false;
  await card.save();

  if (wasDefault) {
    const nextCard = await SavedCard.findOne({
      user: userId,
      isDeleted: false,
    }).sort({ createdAt: -1 });
    if (nextCard) {
      nextCard.isDefault = true;
      await nextCard.save();
    }
  }

  return SavedCard.findById(card._id).select(publicCardSelect);
};

/** Loads one saved card with encrypted token for backend payment use. */
const getUsableCardById = async (
  traceId: string,
  userId: string,
  cardId: string
) => {
  const card = await SavedCard.findOne({
    _id: cardId,
    user: userId,
    isDeleted: false,
  }).select('+paymobCardToken');
  if (!card) {
    throw new ApiError(HttpStatusCode.NotFound, 'Saved card not found', traceId);
  }

  return card;
};

export const SavedCardService = {
  setupSavedCard,
  getMyCards,
  saveCardFromPaymobTransaction,
  processSetupWebhook,
  setDefaultCard,
  deleteCard,
  getUsableCardById,
};
