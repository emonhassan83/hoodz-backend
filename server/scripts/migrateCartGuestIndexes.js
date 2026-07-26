'use strict';

const path = require('node:path');

const mongoose = require('mongoose');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const migrateCartGuestIndexes = async () => {
  const databaseUrl = process.env.MONGODB_URI;
  if (!databaseUrl) {
    throw new Error('MONGODB_URI is not set in .env');
  }

  try {
    console.log('Connecting to database...');
    await mongoose.connect(databaseUrl);

    const collection = mongoose.connection.collection('carts');
    const indexes = await collection.indexes();

    for (const index of indexes) {
      const isOldUserUnique =
        index.unique &&
        JSON.stringify(index.key) === JSON.stringify({ userId: 1 }) &&
        !index.partialFilterExpression;

      if (isOldUserUnique) {
        console.log(`Dropping old cart index: ${index.name}`);
        await collection.dropIndex(index.name);
      }
    }

    await collection.createIndex(
      { userId: 1 },
      {
        unique: true,
        partialFilterExpression: { userId: { $exists: true } },
        name: 'user_cart_unique_partial',
      }
    );

    await collection.createIndex(
      { guestId: 1 },
      {
        unique: true,
        partialFilterExpression: { guestId: { $exists: true } },
        name: 'guest_cart_unique_partial',
      }
    );

    console.log('Cart guest indexes migrated successfully.');
  } finally {
    await mongoose.disconnect();
  }
};

migrateCartGuestIndexes().catch((error) => {
  console.error('Cart guest index migration failed:', error);
  process.exit(1);
});
