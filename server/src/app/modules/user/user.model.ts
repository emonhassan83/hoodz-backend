import { compare, hash } from 'bcrypt';
import { Schema, model } from 'mongoose';

import {
  REGISTER_WITH,
  registerWith,
  USER_ROLE,
  USER_STATUS,
} from '@/app/modules/user/user.constant';
import { IUser, IUserModal } from '@/app/modules/user/user.interface';
import { generateCryptoString } from '@/app/utils/generateCryptoString';

const userSchema = new Schema<IUser, IUserModal>(
  {
    // Define your schema properties here
    id: {
      type: String,
      unique: true,
      default: () => generateCryptoString(4),
    },
    name: { type: String, required: true },
    email: { type: String, required: true, index: true },
    password: { type: String, required: false, select: false },
    securityCode: { type: String, default: null, select: false },
    fcmToken: { type: String, default: null },
    profileAvatar: { type: String, default: null },
    coverPhoto: { type: String, default: null },
    description: { type: String, default: null },
    gender: { type: String, default: null },
    dob: { type: String, default: null },

    countryCode: { type: String, default: null },
    phone: { type: String, default: null },
    address: { type: String, required: false },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0],
      },
    },
    deliveryAddress: { type: String, default: null },
    deliveryLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
      },
    },
    // deliveryTime: { type: String, default: null },
    // deliveryZone: { type: [String], default: [] },
    timeZone: { type: String, default: 'UTC' },
    role: {
      type: String,
      enum: Object.values(USER_ROLE),
      default: USER_ROLE.user,
      index: true,
    },

    registerWith: {
      type: String,
      enum: registerWith,
      default: REGISTER_WITH.credentials,
    },
    avgRating: { type: Number, default: 0, min: 0 },
    ratingCount: { type: Number, default: 0, min: 0 },
    points: { type: Number, default: 0 },
    followers: { type: Number, default: 0 },

    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.active,
      index: true,
    },
    isProfileSetUp: { type: Boolean, default: false },
    needsPasswordChange: { type: Boolean },
    passwordChangedAt: { type: Date },
    isSignUpOtpVerified: {
      type: Boolean,
      default: false,
    },
    isLoginOTPVerified: {
      type: Boolean,
      default: false,
    },
    isResetPasswordVerified: {
      type: Boolean,
      default: false,
    },
    isChangeEmailOtpVerified: {
      type: Boolean,
      default: false,
    },
    isChangePhoneOtpVerified: {
      type: Boolean,
      default: false,
    },
    isLegalTermsAccepted: { type: Boolean, required: true },

    expireAt: {
      type: Date,
      default: () => {
        const expireAt = new Date();
        return expireAt.setMinutes(expireAt.getMinutes() + 30);
      },
    },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        delete (ret as Record<string, unknown>).password;
        delete (ret as Record<string, unknown>).securityCode;
        return ret;
      },
    },
    toObject: {
      transform: (_doc, ret) => {
        delete (ret as Record<string, unknown>).password;
        delete (ret as Record<string, unknown>).securityCode;
        return ret;
      },
    },
  }
);

// Static methods
userSchema.statics.isUserExistsByEmail = async function (email: string) {
  return await this.findOne({ email });
};

userSchema.statics.isPasswordMatched = async function (
  plainTextPassword: string,
  hashedPassword: string
): Promise<boolean> {
  return await compare(plainTextPassword, hashedPassword);
};

userSchema.statics.isSecurityCodeMatched = async function (
  plainTextSecurityCode: string,
  hashedSecurityCode: string
): Promise<boolean> {
  return await compare(plainTextSecurityCode, hashedSecurityCode);
};

// for location and auto expire inactive users
userSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
userSchema.index({ location: '2dsphere' });
userSchema.index({ role: 1, status: 1, isDeleted: 1 });

userSchema.pre('save', async function () {
  // Hash password if modified
  if (this.isModified('password')) {
    this.password = await hash(this.password, 12);
  }
});

export const User: IUserModal = model<IUser, IUserModal>('User', userSchema);

