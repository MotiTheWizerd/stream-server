const prisma = require("../db");

const notificationController = {
  // Get all notifications for the current user
  async getNotifications(req, res) {
    try {
      const userId = req.user.userId;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const notifications = await prisma.notification.findMany({
        where: {
          userId,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 50, // Limit to most recent 50 notifications
      });

      // Count unread notifications
      const unreadCount = await prisma.notification.count({
        where: {
          userId,
          isRead: false,
        },
      });

      res.json({
        notifications,
        unreadCount,
      });
    } catch (error) {
      console.error("Get notifications error:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  },

  // Mark notifications as read
  async markAsRead(req, res) {
    try {
      const userId = req.user.userId;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { notificationId } = req.params;

      // If notificationId is provided, mark specific notification as read
      if (notificationId) {
        const notification = await prisma.notification.findUnique({
          where: { id: notificationId },
        });

        if (!notification) {
          return res.status(404).json({ error: "Notification not found" });
        }

        if (notification.userId !== userId) {
          return res
            .status(403)
            .json({ error: "Not authorized to update this notification" });
        }

        await prisma.notification.update({
          where: { id: notificationId },
          data: { isRead: true },
        });

        return res.json({ message: "Notification marked as read" });
      }

      // If no notificationId, mark all notifications as read
      await prisma.notification.updateMany({
        where: {
          userId,
          isRead: false,
        },
        data: {
          isRead: true,
        },
      });

      res.json({ message: "All notifications marked as read" });
    } catch (error) {
      console.error("Mark notifications as read error:", error);
      res.status(500).json({ error: "Failed to mark notifications as read" });
    }
  },

  // Create a notification (internal use only)
  async createNotification(
    type,
    userId,
    content,
    sourceId = null,
    actorId = null
  ) {
    try {
      const notification = await prisma.notification.create({
        data: {
          type,
          content,
          userId,
          sourceId,
          actorId,
        },
      });

      return notification;
    } catch (error) {
      console.error("Create notification error:", error);
      return null;
    }
  },

  // Delete a notification
  async deleteNotification(req, res) {
    try {
      const userId = req.user.userId;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { notificationId } = req.params;

      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
      });

      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }

      if (notification.userId !== userId) {
        return res
          .status(403)
          .json({ error: "Not authorized to delete this notification" });
      }

      await prisma.notification.delete({
        where: { id: notificationId },
      });

      res.json({ message: "Notification deleted successfully" });
    } catch (error) {
      console.error("Delete notification error:", error);
      res.status(500).json({ error: "Failed to delete notification" });
    }
  },

  // Delete all notifications for a user
  async clearAllNotifications(req, res) {
    try {
      const userId = req.user.userId;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      await prisma.notification.deleteMany({
        where: { userId },
      });

      res.json({ message: "All notifications cleared successfully" });
    } catch (error) {
      console.error("Clear notifications error:", error);
      res.status(500).json({ error: "Failed to clear notifications" });
    }
  },

  // Get unread notification count
  async getUnreadCount(req, res) {
    try {
      const userId = req.user.userId;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const count = await prisma.notification.count({
        where: {
          userId,
          isRead: false,
        },
      });

      res.json({ unreadCount: count });
    } catch (error) {
      console.error("Get unread count error:", error);
      res
        .status(500)
        .json({ error: "Failed to get unread notification count" });
    }
  },
};

module.exports = notificationController;
