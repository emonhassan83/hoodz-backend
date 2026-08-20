export type TSocketRequester = {
  userId: string;
  role: string;
};

export type TSendMessagePayload = {
  chatId: string;
  text?: string;
  files?: string[];
};

export type TDeleteMessagePayload = {
  messageId: string;
};

export type TEditMessagePayload = {
  messageId: string;
  text?: string;
  files?: string[];
};

export type TSeenPayload = {
  chatId: string;
};

export type TTypingPayload = {
  chatId: string;
};

export type TStopTypingPayload = {
  chatId: string;
};

export type TAiSendMessagePayload = {
  message: string;
};
