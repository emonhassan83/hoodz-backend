import {
  REGISTER_WITH,
  USER_ROLE,
  USER_STATUS,
} from '@/app/modules/user/user.constant';

export type IRegisterWith = keyof typeof REGISTER_WITH;
export type IUserRole = keyof typeof USER_ROLE;
export type IUserStatus = keyof typeof USER_STATUS;

export type TCoordinate = {
  latitude: number;
  longitude: number;
};

export type TInvitePlatformUserPayload = {
  name: string;
  email: string;
  countryCode: string;
  phone: string;
};

export type TNearbyShopsQuery = {
  latitude: number;
  longitude: number;
  limit?: number;
  radiusKm?: number;
};

export type TGoogleDistanceElement = {
  status?: string;
  distance?: {
    text?: string;
    value?: number;
  };
  duration?: {
    text?: string;
    value?: number;
  };
};

export type TChangeEmailPayload = {
  email: string;
};

export type TUpdateUserStatusPayload = {
  status: IUserStatus;
};

export type TUpdateLocationPayload = {
  longitude: number;
  latitude: number;
  address: string;
  timeZone?: string;
};

export type TUpdateDeliveryLocationPayload = {
  longitude: number;
  latitude: number;
  deliveryAddress: string;
  timeZone?: string;
};

export type TSetSecurityCodePayload = {
  password: string;
  securityCode: string;
};

export type TVerifySecurityCodePayload = {
  securityCode: string;
};

export type TPlatformInviteEmailJobName =
  | 'send-vendor-invite-email'
  | 'send-agent-invite-email';

export type TPlatformInviteEmailPayload = {
  email: string;
  name: string;
  password: string;
};
