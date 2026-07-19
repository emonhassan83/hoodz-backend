import { Document, Model, Types } from "mongoose";

import { IUserRole, IUserStatus } from "@/app/modules/user/user.types";

export type IGeoLocation = {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
};

export interface IUser extends Document {
  _id: Types.ObjectId
  id: string
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
  deliveryAddress?: string | null;
  deliveryLocation?: IGeoLocation | null;
  deliveryTime?: string | null;
  deliveryZone?: string[];
  timeZone: string;
  role: IUserRole;

  registerWith: string
  stripeCustomerId?: string
  avgRating: number
  ratingCount: number
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
  name: string,
  email: string
  address?: string
  latitude?: number
  longitude?: number
  deliveryAddress?: string
  deliveryLatitude?: number
  deliveryLongitude?: number
  timeZone?: string
  password: string
  role?: IUserRole
  fcmToken?: string
  isLegalTermsAccepted: boolean
}

export interface ISignUpWithPhone {
  name: string,
  countryCode: string
  phone: string
  role?: IUserRole
  fcmToken?: string
  isLegalTermsAccepted: boolean
}
