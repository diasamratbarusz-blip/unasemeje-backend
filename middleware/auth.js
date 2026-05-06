// ================= IMPORTS =================
const jwt = require("jsonwebtoken");

/**
 * =========================================
 * AUTHENTICATION MIDDLEWARE (UNASEMEJE ø DIA)
 * =========================================
 * This middleware protects routes by verifying the JWT token.
 * It ensures only logged-in users can place orders or view their balance.
 */
module.exports = function auth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    // ================= CHECK HEADER =================
    // Ensures the client sent the Authorization header
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: "Access denied. No token provided."
      });
    }

    // ================= EXTRACT TOKEN =================
    // Expected format: "Bearer <token>"
    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "Authentication token is missing"
      });
    }

    // ================= VERIFY TOKEN =================
    // Checks if the token is valid and signed with your secret
    if (!process.env.JWT_SECRET) {
      console.error("FATAL ERROR: JWT_SECRET is not defined in .env");
      return res.status(500).json({ error: "Internal server authentication error" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        error: "Invalid token payload"
      });
    }

    // ================= ATTACH USER =================
    /** 
     * The decoded payload usually contains:
     * { id: user._id, email: user.email, phone: user.phone }
     * This allows subsequent routes (like /api/order) to know who is acting.
     */
    req.user = decoded;

    next();

  } catch (err) {
    // This catches expired tokens or tampered tokens
    console.error("AUTH ERROR:", err.message);

    return res.status(401).json({
      success: false,
      error: "Session expired or invalid token. Please login again."
    });
  }
};
