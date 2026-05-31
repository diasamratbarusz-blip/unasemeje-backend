const mongoose = require("mongoose");

/**
 * =========================================
 * DATABASE CONFIGURATION (UNASEMEJE ø DIA)
 * =========================================
 * This handles the connection to MongoDB.
 * It includes optimized settings for high-frequency SMM & Payment transactions.
 */

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      autoIndex: true, // Ensures unique constraints (like M-Pesa codes) are enforced
      
      /**
       * PRODUCTION SETTINGS:
       * maxPoolSize: Allows more simultaneous connections for busy periods.
       * serverSelectionTimeoutMS: Fails fast if the DB is down to trigger a retry.
       * socketTimeoutMS: Prevents transactions from hanging indefinitely.
       */
      maxPoolSize: 10, 
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000, 
      family: 4 // Use IPv4 for stability on most hosting providers
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    // Monitoring the connection for unexpected drops
    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB Disconnected! Attempting to reconnect...');
      setTimeout(connectDB, 5000);
    });

    mongoose.connection.on('error', (err) => {
      console.error(`❌ MongoDB Runtime Error: ${err.message}`);
    });

  } catch (error) {
    console.error("❌ MongoDB Initial Connection Error:", error.message);

    /**
     * RETRY LOGIC:
     * Critical for Render. If the database is sleeping or spinning up,
     * this prevents the backend from crashing permanently.
     */
    console.log("🔄 Retrying MongoDB connection in 5 seconds...");
    setTimeout(connectDB, 5000);
  }
};

module.exports = connectDB;
