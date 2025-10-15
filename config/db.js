import mongoose from 'mongoose';

export async function connectDB() {
  const mongoUri = process.env.MONGO_URI;
  try {
    if (!mongoUri) {
      console.warn('MONGO_URI not set. Skipping MongoDB connection.');
      return;
    }
    mongoose.set('strictQuery', true);
    await mongoose.connect(mongoUri, { dbName: 'talentrace' });
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error?.message || error);
  }
}


