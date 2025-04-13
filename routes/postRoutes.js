const express = require("express");
const multer = require("multer");
const postController = require("../controllers/postController");
const reactionController = require("../controllers/reactionController");
const authenticateToken = require("../middleware/authenticateToken");
const optionalAuthToken = require("../middleware/optionalAuthToken");

const router = express.Router();

// Configure Multer
// Using memory storage for simplicity - consider disk storage or direct cloud upload for production
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // Increased limit to 100MB per file
  fileFilter: (req, file, cb) => {
    // Basic file type validation (allow images and videos)
    if (
      file.mimetype.startsWith("image/") ||
      file.mimetype.startsWith("video/")
    ) {
      cb(null, true);
    } else {
      cb(
        new Error("Invalid file type. Only images and videos are allowed."),
        false
      );
    }
  },
});

// Define the expected fields for multer based on frontend naming
const mediaUploadFields = [
  { name: "media_0", maxCount: 1 },
  { name: "media_1", maxCount: 1 },
  { name: "media_2", maxCount: 1 },
  { name: "media_3", maxCount: 1 },
  { name: "media_4", maxCount: 1 },
  { name: "media_5", maxCount: 1 },
  { name: "media_6", maxCount: 1 },
  { name: "media_7", maxCount: 1 },
  { name: "media_8", maxCount: 1 },
  { name: "media_9", maxCount: 1 },
  { name: "media_10", maxCount: 1 },
  { name: "media_11", maxCount: 1 },
  { name: "media_12", maxCount: 1 },
  { name: "media_13", maxCount: 1 },
  { name: "media_14", maxCount: 1 },
  { name: "media_15", maxCount: 1 },
  { name: "media_16", maxCount: 1 },
  { name: "media_17", maxCount: 1 },
  { name: "media_18", maxCount: 1 },
  { name: "media_19", maxCount: 1 },
];

// --- Post Routes ---

// POST /api/posts - Create a new post
// Applies auth middleware, then multer for specific fields, then controller
router.post(
  "/",
  authenticateToken,
  upload.fields(mediaUploadFields), // Use upload.fields to handle specific field names
  (req, res, next) => {
    // Consolidate files from different fields into req.files array for the controller
    req.files = req.files ? Object.values(req.files).flat() : [];
    next();
  },
  postController.createPost
);

// GET /api/posts - Get all posts (authentication is now optional)
router.get("/", optionalAuthToken, postController.getAllPosts);

// POST /api/posts/:postId/comments - Add a comment to a post
router.post(
  "/:postId/comments",
  authenticateToken,
  postController.createComment
);

// POST /api/posts/:postId/reactions - Add/Update/Remove a reaction to a post
router.post(
  "/:postId/reactions",
  authenticateToken,
  reactionController.handleReaction
);

// Add new route for media item reactions
// POST /api/posts/media/:mediaId/reactions - Add/Update/Remove a reaction to a media item
router.post(
  "/media/:mediaId/reactions",
  authenticateToken,
  reactionController.handleReaction
);

// Add other post routes here (GET, PUT, DELETE) as needed
// Example: GET /api/posts - Get all posts (or posts for a user)
// router.get('/', postController.getAllPosts);

// Example: GET /api/posts/:id - Get a single post
// router.get('/:id', postController.getPostById);

module.exports = router;
