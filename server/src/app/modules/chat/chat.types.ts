import { IChatType } from '@/app/modules/chat/chat.constant';

export type TCreateChatPayload = {
  type: IChatType;
  order?: string;
  participant?: string;
  participent?: string;
};

export type TChatRequester = {
  userId: string;
  role: string;
};


