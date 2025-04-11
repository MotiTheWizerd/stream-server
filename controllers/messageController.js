const prisma = require("../db");
const notificationController = require("./notificationController");

const messageController = {
  // Send a new message
  async sendMessage(req, res) {
    try {
      // Debug the user object to see what we're getting
      console.log("User object in request:", req.user);

      // Get the user ID from the JWT token
      const senderId = req.user.userId;

      if (!senderId) {
        return res.status(401).json({
          error: "Unauthorized - authentication required",
        });
      }

      const { recipientId, subject, content } = req.body;

      if (!recipientId || !subject || !content) {
        return res.status(400).json({
          error: "Recipient ID, subject, and content are required",
        });
      }

      // Check if recipient exists
      const recipient = await prisma.user.findUnique({
        where: { id: recipientId },
      });

      if (!recipient) {
        return res.status(404).json({ error: "Recipient not found" });
      }

      const message = await prisma.message.create({
        data: {
          subject,
          content,
          senderId,
          recipientId,
        },
      });

      // Get sender info for notification
      const sender = await prisma.user.findUnique({
        where: { id: senderId },
        select: { username: true },
      });

      // Create a notification for the recipient
      if (sender) {
        await notificationController.createNotification(
          "MESSAGE",
          recipientId,
          `New message from ${sender.username}: ${subject}`,
          message.id, // source ID (message ID)
          senderId // actor ID (sender ID)
        );
      }

      res.status(201).json({
        message: "Message sent successfully",
        data: {
          id: message.id,
          subject: message.subject,
          createdAt: message.createdAt,
        },
      });
    } catch (error) {
      console.error("Send message error:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  },

  // Get all messages for the current user (inbox)
  async getInbox(req, res) {
    try {
      const userId = req.user.userId;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const messages = await prisma.message.findMany({
        where: {
          recipientId: userId,
        },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              avatar: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      res.json(messages);
    } catch (error) {
      console.error("Get inbox error:", error);
      res.status(500).json({ error: "Failed to fetch inbox messages" });
    }
  },

  // Get all sent messages by the current user
  async getSentMessages(req, res) {
    try {
      const userId = req.user.userId;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const messages = await prisma.message.findMany({
        where: {
          senderId: userId,
        },
        include: {
          recipient: {
            select: {
              id: true,
              username: true,
              avatar: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      res.json(messages);
    } catch (error) {
      console.error("Get sent messages error:", error);
      res.status(500).json({ error: "Failed to fetch sent messages" });
    }
  },

  // Get a single message by ID
  async getMessage(req, res) {
    try {
      const userId = req.user.userId;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const messageId = req.params.id;

      const message = await prisma.message.findUnique({
        where: {
          id: messageId,
        },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              avatar: true,
            },
          },
          recipient: {
            select: {
              id: true,
              username: true,
              avatar: true,
            },
          },
        },
      });

      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      // Check if user is either sender or recipient
      if (message.senderId !== userId && message.recipientId !== userId) {
        return res
          .status(403)
          .json({ error: "Not authorized to view this message" });
      }

      // Mark as read if user is recipient and message is unread
      if (message.recipientId === userId && !message.isRead) {
        await prisma.message.update({
          where: { id: messageId },
          data: { isRead: true },
        });
      }

      res.json(message);
    } catch (error) {
      console.error("Get message error:", error);
      res.status(500).json({ error: "Failed to fetch message" });
    }
  },

  // Mark a message as read
  async markAsRead(req, res) {
    try {
      const userId = req.user.userId;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const messageId = req.params.id;

      const message = await prisma.message.findUnique({
        where: { id: messageId },
      });

      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      // Check if user is the recipient
      if (message.recipientId !== userId) {
        return res
          .status(403)
          .json({ error: "Not authorized to update this message" });
      }

      await prisma.message.update({
        where: { id: messageId },
        data: { isRead: true },
      });

      res.json({ message: "Message marked as read" });
    } catch (error) {
      console.error("Mark as read error:", error);
      res.status(500).json({ error: "Failed to mark message as read" });
    }
  },

  // Delete a message
  async deleteMessage(req, res) {
    try {
      const userId = req.user.userId;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const messageId = req.params.id;

      const message = await prisma.message.findUnique({
        where: { id: messageId },
      });

      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      // Check if user is either sender or recipient
      if (message.senderId !== userId && message.recipientId !== userId) {
        return res
          .status(403)
          .json({ error: "Not authorized to delete this message" });
      }

      await prisma.message.delete({
        where: { id: messageId },
      });

      res.json({ message: "Message deleted successfully" });
    } catch (error) {
      console.error("Delete message error:", error);
      res.status(500).json({ error: "Failed to delete message" });
    }
  },
};

module.exports = messageController;
