const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notificationController");
const authenticateToken = require("../middleware/authenticateToken");

// Protect all notification routes with authentication
router.use(authenticateToken);

// Get all notifications for the current user
router.get("/", notificationController.getNotifications);

// Get unread notification count
router.get("/unread-count", notificationController.getUnreadCount);

// Mark all notifications as read
router.put("/mark-all-read", notificationController.markAsRead);

// Mark a specific notification as read
router.put("/:notificationId/read", notificationController.markAsRead);

// Delete a notification
router.delete("/:notificationId", notificationController.deleteNotification);

// Clear all notifications
router.delete("/", notificationController.clearAllNotifications);

module.exports = router; 