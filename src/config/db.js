import mongoose from "mongoose";

const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) return;

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000, // Wait 5 seconds before failing
      socketTimeoutMS: 45000,
    });
    console.log(`[GAMH] MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error("[GAMH] MongoDB connection error:", err.message);
    // Don't exit in serverless environment, just throw so Vercel can handle it
    throw err;
  }
};

export default connectDB;
