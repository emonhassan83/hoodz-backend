import { Types } from 'mongoose';

import { IUserRole } from '@/app/modules/user/user.types';

export type TJwtPayload = {
  userId: Types.ObjectId;
  email: string;
  role: string;
};

export type TExpiresIn =
  | number
  | '30s'
  | '1m'
  | '5m'
  | '10m'
  | '1h'
  | '1d'
  | '7d'
  | '30d'
  | '365d';

export type TLoginWithEmail = {
  email: string;
  password: string;
  fcmToken?: string;
};

export type TLoginWithPhone = {
  phone: string;
  fcmToken?: string;
};

export type TGoogleLoginPayload = {
  name?: string;
  email: string;
  role?: IUserRole;
  photoUrl?: string;
  token?: string;
  fcmToken?: string;
  profileAvatar?: string;
  countryCode?: string;
  phone?: string;
  isLegalTermsAccepted: boolean;
};

export type TAppleLoginPayload = TGoogleLoginPayload;

export type TForgotPasswordPayload = {
  email: string;
};

export type TResetPasswordPayload = {
  password: string;
  confirmPassword: string;
};

export type TChangePasswordPayload = TResetPasswordPayload & {
  currentPassword: string;
};
