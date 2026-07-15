'use strict';

const path = require('node:path');
const crypto = require('node:crypto');

const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const USER_ROLE = {
  admin: 'admin',
};

const USER_STATUS = {
  active: 'active',
};

const generateUserId = () => `#ST-${crypto.randomInt(1000, 10000)}`;

const userSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true, default: generateUserId },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    password: { type: String, required: true },
    role: { type: String, default: 'user' },
    status: { type: String, default: USER_STATUS.active },
    registerWith: { type: String, default: 'credentials' },
    isSignUpOtpVerified: { type: Boolean, default: false },
    isLegalTermsAccepted: { type: Boolean, default: false },
    expireAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model('User', userSchema);

const getAdminData = async () => {
  const plainPassword = process.env.ADMIN_PASSWORD || process.env.ADMIN_PASS;
  if (!plainPassword) {
    throw new Error('ADMIN_PASSWORD is not set in .env');
  }
  if (plainPassword.length < 8) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters long');
  }

  return {
    name: 'HOODZ',
    email: 'admin@hoodz.gmail.com',
    password: await bcrypt.hash(plainPassword, 12),
    role: USER_ROLE.admin,
    status: USER_STATUS.active,
    registerWith: 'credentials',
    isSignUpOtpVerified: true,
    isLegalTermsAccepted: true,
    expireAt: null,
    isDeleted: false,
  };
};

const seedAdmin = async () => {
  const databaseUrl = process.env.MONGODB_URI;
  if (!databaseUrl) {
    throw new Error('MONGODB_URI is not set in .env');
  }

  try {
    console.log('📦 Connecting to database...');
    await mongoose.connect(databaseUrl);
    console.log('✅ Database connected successfully!');

    const existingAdmin = await User.findOne({
      role: USER_ROLE.admin,
      isDeleted: false,
    }).lean();

    if (existingAdmin) {
      console.log('⚠️ Admin user already exists — skipping seed.');
      return;
    }

    const adminUser = await getAdminData();
    await User.create(adminUser);
    console.log(`✅ Admin user seeded successfully: ${adminUser.email}`);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Database connection closed.');
  }
};

seedAdmin().catch((error) => {
  console.error('❌ Error seeding admin:', error.message);
  process.exitCode = 1;
});
