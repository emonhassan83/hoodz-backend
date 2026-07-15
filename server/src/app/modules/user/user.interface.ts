import { Document, Model, Types } from "mongoose";

import { IUserRole, IUserStatus } from "@/app/modules/user/user.constant";

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
  description?: string | null;
  gender?: string | null;
  dob?: Date | null;
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
  countryCode: string
  phone: string
  password: string
  isLegalTermsAccepted: boolean
}

export interface ISignUpWithPhone {
  name: string,
  email: string
  countryCode: string
  phone: string
  isLegalTermsAccepted: boolean
}
