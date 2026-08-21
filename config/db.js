const mongoose = require('mongoose');

let isConnected = false;

async function connectDB() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    console.log('[MongoDB] ⚠️ No MONGODB_URI found in environment variables. Falling back to local JSON storage.');
    return false;
  }

  if (isConnected) {
    return true;
  }

  try {
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: true
    });

    isConnected = conn.connections[0].readyState === 1;
    console.log(`[MongoDB] 🟢 Connected successfully to MongoDB: ${conn.connection.host}`);
    return true;
  } catch (err) {
    console.error(`[MongoDB] 🔴 Connection error: ${err.message}. Using JSON fallback.`);
    isConnected = false;
    return false;
  }
}

function getIsConnected() {
  return isConnected;
}

module.exports = {
  connectDB,
  getIsConnected
};
