export type TSetupSavedCardPayload = {
  setDefault?: boolean;
};

export type TSavedCardWebhookData = {
  token?: string;
  maskedPan?: string;
  last4?: string;
  cardBrand?: string;
  cardSubType?: string | null;
};
