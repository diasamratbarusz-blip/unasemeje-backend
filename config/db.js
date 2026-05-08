const mongoose = require("mongoose");

/**
 * =========================================
 * DATABASE CONFIGURATION (UNASEMEJE ø DIA)
 * =========================================
 * This handles the connection to MongoDB.
 * It includes a retry mechanism to ensure the SMM panel 
 * stays online even if the database temporarily fluctuates.
 */

const connectDB = async () => {
  try {
    // Attempting connection using the MONGO_URI from your .env
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      autoIndex: true, // Ensures indexes (like for User/Order searches) are built
      serverSelectionTimeoutMS: 5000 // Fails quickly if DB is unreachable
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error.message);

    /**
     * RETRY LOGIC:
     * This is critical for production on Render.
     * If the DB is not ready, it waits 5 seconds and tries again 
     * instead of letting the whole server crash.
     */
    console.log("🔄 Retrying MongoDB connection in 5 seconds...");
    setTimeout(connectDB, 5000);
  }
};

module.exports = connectDB;
