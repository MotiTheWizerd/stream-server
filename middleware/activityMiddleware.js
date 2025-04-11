const prisma = require("../db");

const activityMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (token) {
      // Verify token and get userId - assuming you have JWT middleware before this
      const userId = req.user?.userId;
      if (userId) {
        // Update lastActive timestamp
        await prisma.user.update({
          where: { id: userId },
          data: { lastActive: new Date() },
        });
      }
    }
  } catch (error) {
    console.error("Activity tracking error:", error);
  }
  next();
};

module.exports = activityMiddleware;
