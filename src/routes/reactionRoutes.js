import { Router } from "express";
import { handleMediaReaction } from "../controllers/reactionController";
import { protect } from "../middlewares/authMiddleware"; // Assuming protect verifies JWT

const router = Router();

/**
 * @route   POST /api/media/:mediaId/reactions
 * @desc    Add, update, or remove a reaction for a specific media item
 * @access  Private (requires authentication)
 */
router.post(
  "/media/:mediaId/reactions",
  protect, // Ensure user is logged in
  handleMediaReaction
);

// You might also have routes for post-level reactions here
// router.post('/posts/:postId/reactions', protect, handlePostReaction); // Example

export default router;
