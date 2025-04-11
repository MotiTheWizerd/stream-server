const express = require("express");
const router = express.Router();
const messageController = require("../controllers/messageController");
const authenticateToken = require("../middleware/authenticateToken");

// Apply authentication middleware to all message routes
router.use(authenticateToken);

// Send a new message
router.post("/", messageController.sendMessage);

// Get inbox messages
router.get("/inbox", messageController.getInbox);

// Get sent messages
router.get("/sent", messageController.getSentMessages);

// Get a single message by ID
router.get("/:id", messageController.getMessage);

// Mark a message as read
router.patch("/:id/read", messageController.markAsRead);

// Delete a message
router.delete("/:id", messageController.deleteMessage);

module.exports = router;
