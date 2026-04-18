// ================= IMPORTS =================
const jwt = require("jsonwebtoken");

// ================= AUTH MIDDLEWARE =================
module.exports = function auth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    // ================= CHECK HEADER =================
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: "Authorization header missing"
      });
    }

    // ================= EXTRACT TOKEN =================
    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "Token missing"
      });
    }

    // ================= VERIFY TOKEN =================
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        error: "Invalid token payload"
      });
    }

    // ================= ATTACH USER =================
    req.user = decoded;

    next();

  } catch (err) {
    console.error("AUTH ERROR:", err.message);

    return res.status(401).json({
      success: false,
      error: "Invalid or expired token"
    });
  }
};
