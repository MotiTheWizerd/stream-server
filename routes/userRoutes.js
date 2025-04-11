const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const authenticateToken = require("../middleware/authenticateToken"); // Assuming middleware path
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Configure multer for avatar uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const userId = req.user.userId;
    const userDir = path.join(
      __dirname,
      "..", // Go up one level from routes to server
      "public", // Target the server's public directory
      "users",
      "images",
      userId
    );

    // Create directory if it doesn't exist
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }

    cb(null, userDir);
  },
  filename: function (req, file, cb) {
    // Save as user_avatar.jpeg (always overwrite)
    cb(null, "user_avatar.jpeg");
  },
});

// File filter to only allow images
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
  },
  fileFilter: fileFilter,
});

router.post("/register", userController.register);
router.post("/login", userController.login);
router.post("/logout", authenticateToken, userController.logout);
router.get("/:userId", authenticateToken, userController.getUserProfile);

router.post("/follow", authenticateToken, userController.followUser);
router.post("/unfollow", authenticateToken, userController.unfollowUser);
router.post(
  "/request-creator",
  authenticateToken,
  userController.requestCreator
);

// Avatar upload route
router.post(
  "/avatar",
  authenticateToken,
  upload.single("avatar"),
  userController.uploadAvatar
);

// Admin routes
router.get(
  "/admin/creator-requests",
  authenticateToken,
  userController.getCreatorRequests
);
router.post(
  "/admin/creator-requests/:requestId/approve",
  authenticateToken,
  userController.approveCreatorRequest
);
router.post(
  "/admin/creator-requests/:requestId/reject",
  authenticateToken,
  userController.rejectCreatorRequest
);

module.exports = router;
