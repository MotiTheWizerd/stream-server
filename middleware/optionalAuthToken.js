const jwt = require("jsonwebtoken");

/**
 * Middleware that attempts to authenticate a user but continues even if no token is provided
 * or the token is invalid. This allows both authenticated and unauthenticated access
 * with different capabilities.
 */
const optionalAuthToken = async (req, res, next) => {
  // Get token from Authorization header (e.g., 'Bearer TOKEN_STRING')
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  // If no token, just continue as unauthenticated
  if (!token) {
    console.log(
      "Optional Auth: No token provided, continuing as unauthenticated"
    );
    req.user = null; // Explicitly set user to null to indicate unauthenticated
    return next();
  }

  try {
    // Verify the token if present
    if (!process.env.JWT_SECRET) {
      console.error(
        "Optional Auth: JWT_SECRET is not defined in environment variables."
      );
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    next(); // Proceed with authenticated user
  } catch (err) {
    // Token is invalid but we'll continue anyway

    req.user = null;
    next();
  }
};

module.exports = optionalAuthToken;
