const path = require('path');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

SettingSchema.index({ key: 1, vendor: 1 }, { unique: true });

const Setting = mongoose.model('Setting', SettingSchema);

const settingsData = [
  {
    key: 'userTermsAndConditions',
    value: 'User terms and conditions content goes here...',
    vendor: null,
  },
  {
    key: 'userPrivacyAndPolicy',
    value: 'User privacy and policy content goes here...',
    vendor: null,
  },
  {
    key: 'riderTermsAndConditions',
    value: 'Rider terms and conditions content goes here...',
    vendor: null,
  },
  {
    key: 'riderPrivacyAndPolicy',
    value: 'Rider privacy and policy content goes here...',
    vendor: null,
  },
  {
    key: 'vendorTermsAndConditions',
    value: 'Vendor terms and conditions content goes here...',
    vendor: null,
  },
  {
    key: 'vendorPrivacyAndPolicy',
    value: 'Vendor privacy and policy content goes here...',
    vendor: null,
  },
  {
    key: 'agentTermsAndConditions',
    value: 'Agent terms and conditions content goes here...',
    vendor: null,
  },
  {
    key: 'agentPrivacyAndPolicy',
    value: 'Agent privacy and policy content goes here...',
    vendor: null,
  },
];

const run = async () => {
  const uri = process.env.MONGODB_URI || process.env.DB_URL;

  if (!uri) {
    console.error('MONGODB_URI or DB_URL is not set in .env');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    try {
      await Setting.collection.dropIndex('key_1');
      console.log('Dropped old unique key index');
    } catch (err) {
      if (err.codeName !== 'IndexNotFound') {
        console.warn('Could not drop old key_1 index:', err.message);
      }
    }

    await Setting.syncIndexes();

    const bulkOps = settingsData.map((setting) => ({
      updateOne: {
        filter: { key: setting.key, vendor: setting.vendor },
        update: { $setOnInsert: setting },
        upsert: true,
      },
    }));

    const result = await Setting.bulkWrite(bulkOps);

    console.log('Settings seeded:');
    console.log(`   Inserted : ${result.upsertedCount}`);
    console.log(`   Skipped  : ${result.matchedCount} (already exist)`);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

run();
