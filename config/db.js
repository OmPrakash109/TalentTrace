import mongoose from 'mongoose';

export async function connectToDatabase() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    // eslint-disable-next-line no-console
    console.warn('MONGO_URI not set. Starting server without database connection.');
    return;
  }

  try {
    mongoose.set('strictQuery', true);

    await mongoose.connect(mongoUri, {
      dbName: 'talentrace'
    });

    // eslint-disable-next-line no-console
    console.log('Connected to MongoDB');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('MongoDB connection failed. Continuing without DB.', err?.message || err);
  }
}


