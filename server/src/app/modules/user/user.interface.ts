import { Document, Model, Types } from "mongoose";

import {
  IUserLanguage,
  IUserRole,
  IUserStatus,
} from "@/app/modules/user/user.types";

export type IGeoLocation = {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
};

export type IUserDeliveryAddress = {
  name: string;
  location: IGeoLocation;
  buildingNo?: number | null;
  floorNo?: number | null;
  apartment?: number | null;
  city: string;
  country: string;
};

export type IAgentSchedule = {
  startTime: string;
  endTime: string;
};

export interface IUser extends Document {
  _id: Types.ObjectId
  id: string
  referralCode: string
  referredBy?: Types.ObjectId | null
  referralCodeUsed?: string | null
  name: string;
  email: string;
  password: string;
  securityCode?: string | null;
  fcmToken: string
  profileAvatar: string
  coverPhoto?: string | null
  description?: string | null;
  gender?: string | null;
  dob?: string | null;
  countryCode?: string
  phone: string | null;
  address: string;
  location: IGeoLocation | null;
  deliveryAddress?: IUserDeliveryAddress | null;
  isOnline: boolean;
  hasRiderActivateMode: boolean;
  lastAvailable?: IGeoLocation | null;
  lastAvailableAt?: Date | null;
  timeZone: string;
  language: IUserLanguage;
  agentSchedule?: IAgentSchedule | null;
  role: IUserRole;

  registerWith: string
  avgRating: number
  ratingCount: number
  balance: number
  walletBalance: number
  followers: number

  passwordChangedAt?: Date
  needsPasswordChange: boolean
  isVerified: boolean;
  isSignUpOtpVerified: boolean;
  isLoginOTPVerified: boolean;
  isResetPasswordVerified: boolean;
  isChangeEmailOtpVerified: boolean;
  isChangePhoneOtpVerified: boolean;
  status: IUserStatus;
  isProfileSetUp: boolean;
  isLegalTermsAccepted: boolean;
  expireAt: Date
  isDeleted: boolean
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserModal extends Model<IUser> {
  isUserExistsByEmail(email: string): Promise<IUser>

  isPasswordMatched(
    plainTextPassword: string,
    hashedPassword: string,
  ): Promise<boolean>

  isSecurityCodeMatched(
    plainTextSecurityCode: string,
    hashedSecurityCode: string,
  ): Promise<boolean>
}


export interface ISignUpWithEmail {
  name?: string,
  email: string
  address?: string
  latitude?: number
  longitude?: number
  deliveryAddress?: IUserDeliveryAddress
  deliveryLatitude?: number
  deliveryLongitude?: number
  timeZone?: string
  password: string
  role?: IUserRole
  fcmToken?: string
  referralCode?: string
  isLegalTermsAccepted: boolean
}

export interface ISignUpWithPhone {
  name: string,
  countryCode: string
  phone: string
  role?: IUserRole
  fcmToken?: string
  referralCode?: string
  isLegalTermsAccepted: boolean
}


