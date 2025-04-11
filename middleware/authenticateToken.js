// server/middleware/authenticateToken.js
const jwt = require("jsonwebtoken");
const prisma = require("../db"); // Assuming prisma client is accessible via '../db'

// Using async/await for cleaner asynchronous handling
const authenticateToken = async (req, res, next) => {
  // Get token from Authorization header (e.g., 'Bearer TOKEN_STRING')
  const authHeader = req.headers["authorization"];

  const token = authHeader && authHeader.split(" ")[1];

  // If no token, return 401 Unauthorized
  if (token == null) {
    console.log("Auth Middleware: No token provided."); // Uncommented debug log
    return res
      .status(401)
      .json({ error: "Access token is missing or invalid" });
  }

  try {
    // Verify the token using await (make sure JWT_SECRET is loaded)
    // TODO: Ensure JWT_SECRET is correctly loaded from .env
    if (!process.env.JWT_SECRET) {
      console.error(
        "Auth Middleware: JWT_SECRET is not defined in environment variables."
      );
      return res
        .status(500)
        .json({ error: "Internal server configuration error." });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Optional: Check if user exists in DB (more secure)
    // const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    // if (!user) {
    //   console.log(`Auth Middleware: User ID ${decoded.userId} from token not found in DB.`);
    //   return res.status(401).json({ error: "User not found or token invalid" });
    // }

    // Attach the decoded payload (which should include userId) to the request
    req.user = decoded;

    next(); // Proceed with authenticated user
  } catch (err) {
    // Token is invalid (expired, wrong signature, etc.)

    return res
      .status(401)
      .json({ error: "Access token is invalid or expired" });
  }
};

module.exports = authenticateToken;
