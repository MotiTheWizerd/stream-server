const prisma = require("../db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Prisma } = require("@prisma/client");
const notificationController = require("./notificationController");

const userController = {
  // Register new user
  async register(req, res) {
    try {
      const { username, email, password } = req.body;

      // Input validation
      if (!email || !password || !username) {
        return res
          .status(400)
          .json({ error: "Email, password and username are required" });
      }

      if (password.length < 6) {
        return res
          .status(400)
          .json({ error: "Password must be at least 6 characters long" });
      }

      // Check if email is already registered
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return res.status(400).json({ error: "Email already registered" });
      }

      // Hash password and create user
      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          username,
          email,
          password: hashedPassword,
        },
      });

      // Create JWT token
      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
        expiresIn: "24h",
      });

      res.status(201).json({
        message: "User created successfully",
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
        },
        token,
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(400).json({
        error:
          error.code === "P2002"
            ? "Email already exists"
            : "Registration failed",
      });
    }
  },

  // Login user
  async login(req, res) {
    try {
      const { email, password } = req.body;

      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const validPassword = await bcrypt.compare(password, user.password);

      if (!validPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Update user's online status
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { isOnline: true, lastActive: new Date() },
        select: {
          id: true,
          username: true,
          email: true,
          isOnline: true,
          isCreator: true,
          avatar: true,
        },
      });

      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
        expiresIn: "24h",
      });

      // --- DEBUG LOG ---
      console.log(
        "[Login Endpoint] User data being sent to client:",
        updatedUser
      );
      // --- END DEBUG LOG ---

      res.json({
        token,
        user: updatedUser,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(400).json({ error: error.message });
    }
  },

  // Add a logout endpoint to set isOnline to false
  async logout(req, res) {
    try {
      const userId = req.user.userId; // Using userId from JWT token

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      await prisma.user.update({
        where: { id: userId },
        data: { isOnline: false },
      });

      res.json({ message: "Logged out successfully" });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(400).json({ error: error.message });
    }
  },

  // Get user profile
  async getUserProfile(req, res) {
    try {
      const { userId } = req.params; // The ID of the profile being viewed
      const requestingUserId = req.user?.userId; // The ID of the user making the request (if logged in)

      if (!userId) {
        return res.status(400).json({ error: "User ID parameter is missing" });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          bio: true,
          avatar: true,
          isOnline: true,
          isLive: true,
          isCreator: true,
          // Select the relation representing the *followers* of this user (likely users_B)
          // Filter this list to check if the requesting user is present.
          users_B: requestingUserId
            ? { where: { id: requestingUserId } }
            : undefined, // Don't try to filter if no requesting user
        },
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get follower count (users_B represents followers)
      const followerCount = await prisma.user.count({
        where: {
          users_A: {
            some: {
              id: userId,
            },
          },
        },
      });

      // Get following count (users_A represents users this user is following)
      const followingCount = await prisma.user.count({
        where: {
          users_B: {
            some: {
              id: userId,
            },
          },
        },
      });

      // Determine if the requesting user is following the profile user
      // Check if users_B array exists and has any entries after filtering
      const isFollowing = !!requestingUserId && !!user.users_B?.length; // Check if length > 0

      // Remove the relation array from the response, it was only needed for the check
      const { users_B, ...userProfileData } = user;

      res.json({
        ...userProfileData,
        isFollowing,
        followerCount,
        followingCount,
      });
    } catch (error) {
      console.error("Get user profile error:", error);
      // Check if the error is due to the unknown field again
      if (error.message?.includes("Unknown field")) {
        console.error(
          `Prisma Schema Error: The field used to check followers (e.g., 'users_B') might be incorrect. Please verify the relation name in your Prisma schema for the followers side of the User-User relation.`
        );
        return res.status(500).json({
          error: "Server configuration error regarding user relations.",
        });
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        // This can happen if the requestingUserId in the 'where' clause doesn't exist, although findUnique should handle the primary user not found.
        return res
          .status(404)
          .json({ error: "User not found or related record issue." });
      }
      res
        .status(500)
        .json({ error: "Failed to get user profile.", details: error.message });
    }
  },

  // Follow a user
  async followUser(req, res) {
    try {
      // Extract IDs - Assuming req.user.userId from JWT token
      const followerId = req.user?.userId; // Use optional chaining for safety
      const { userIdToFollow } = req.body;

      // Basic validation
      if (!followerId) {
        console.error(
          "Follow Error: Follower ID (req.user.userId) is missing. Check authentication middleware."
        );
        // Return 401 Unauthorized as followerId should come from authenticated user
        return res
          .status(401)
          .json({ error: "Authentication required to follow." });
      }
      if (!userIdToFollow) {
        console.error(
          "Follow Error: userIdToFollow is missing from request body."
        );
        return res
          .status(400)
          .json({ error: "Missing userIdToFollow in request body." });
      }
      if (followerId === userIdToFollow) {
        console.warn(
          `Follow Warning: User ${followerId} attempted to follow themselves.`
        );
        return res.status(400).json({ error: "Cannot follow yourself." });
      }

      // Use prisma.user.update to connect the users via the relation
      // Assuming 'users_A' represents the list of users the 'followerId' user is following
      await prisma.user.update({
        where: { id: followerId }, // Update the record of the user performing the follow
        data: {
          users_A: {
            // Connect to the user being followed via the 'users_A' relation field
            connect: { id: userIdToFollow },
          },
        },
      });

      // Get follower info for notification
      const follower = await prisma.user.findUnique({
        where: { id: followerId },
        select: { username: true, avatar: true },
      });

      // Create notification for the user being followed
      if (follower) {
        const notificationContent = `🔥 ${follower.username} just started following you!`;

        await notificationController.createNotification(
          "FOLLOW",
          userIdToFollow,
          notificationContent,
          null, // source ID
          followerId // actor ID (follower ID)
        );

        console.log(
          `Created follow notification: "${notificationContent}" for user ${userIdToFollow}`
        );
      }

      res.json({ message: "Successfully followed user." });
    } catch (error) {
      console.error("Follow user error object:", error);

      // Handle specific Prisma errors
      if (error.code === "P2025") {
        // Prisma code for "Record to update not found." or "Record to connect not found."
        console.error(
          `Follow Error P2025: Follower (${followerId}) or Followee (${userIdToFollow}) not found.`
        );
        return res
          .status(404)
          .json({ error: "User to follow or follower not found." });
      }
      if (error.code === "P2016" || error.code === "P2018") {
        // Relation violation - trying to connect a non-existent record
        console.error(
          `Follow Error P201X: Attempted to connect potentially non-existent user: Follower ${followerId}, Followee ${userIdToFollow}.`
        );
        return res.status(404).json({ error: "User to follow not found." });
      }
      // Generic error
      res
        .status(500)
        .json({ error: "Failed to follow user", details: error.message });
    }
  },

  // Unfollow a user
  async unfollowUser(req, res) {
    try {
      const followerId = req.user?.userId;
      const { userIdToUnfollow } = req.body;

      if (!followerId) {
        return res
          .status(401)
          .json({ error: "Authentication required to unfollow." });
      }
      if (!userIdToUnfollow) {
        return res
          .status(400)
          .json({ error: "Missing userIdToUnfollow in request body." });
      }
      if (followerId === userIdToUnfollow) {
        return res.status(400).json({ error: "Cannot unfollow yourself." });
      }

      // Use prisma.user.update with disconnect, matching the followUser logic
      await prisma.user.update({
        where: { id: followerId }, // Update the record of the user performing the unfollow
        data: {
          users_A: {
            // Assuming 'users_A' is the relation field for users being followed
            disconnect: { id: userIdToUnfollow }, // Disconnect the user being unfollowed
          },
        },
      });

      // Note: Prisma's disconnect usually doesn't error if the connection doesn't exist.

      res.json({ message: "Successfully unfollowed user." });
    } catch (error) {
      console.error("Unfollow user error:", error);
      // Handle specific Prisma errors if needed (e.g., P2025 if followerId doesn't exist)
      if (error.code === "P2025") {
        return res
          .status(404)
          .json({ error: "User performing unfollow not found." });
      }
      res
        .status(500)
        .json({ error: "Failed to unfollow user", details: error.message });
    }
  },

  // Request creator status
  async requestCreator(req, res) {
    try {
      const userId = req.user?.userId;
      const { message } = req.body; // Optional message from the user

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Check if the user already has a pending request
      const existingRequest = await prisma.creatorRequest.findFirst({
        where: {
          userId,
          status: "PENDING",
        },
      });

      if (existingRequest) {
        return res.status(400).json({
          error: "You already have a pending creator request",
          requestId: existingRequest.id,
          createdAt: existingRequest.createdAt,
        });
      }

      // Check if the user is already a creator
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { isCreator: true },
      });

      if (user?.isCreator) {
        return res.status(400).json({ error: "You are already a creator" });
      }

      // Create a new creator request
      const creatorRequest = await prisma.creatorRequest.create({
        data: {
          userId,
          message,
          status: "PENDING",
        },
      });

      res.status(201).json({
        message: "Creator request submitted successfully",
        requestId: creatorRequest.id,
        status: creatorRequest.status,
      });
    } catch (error) {
      console.error("Request creator error:", error);
      res.status(500).json({ error: "Failed to process creator request" });
    }
  },

  // Get all creator requests (admin only)
  async getCreatorRequests(req, res) {
    try {
      // In a real app, check if user is admin
      // if (!req.user.isAdmin) {
      //   return res.status(403).json({ error: "Unauthorized. Admin access required." });
      // }

      const requests = await prisma.creatorRequest.findMany({
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              avatar: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      // Format the response
      const formattedRequests = requests.map((request) => ({
        id: request.id,
        userId: request.userId,
        username: request.user.username,
        email: request.user.email,
        avatar: request.user.avatar,
        message: request.message,
        status: request.status,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
      }));

      res.json(formattedRequests);
    } catch (error) {
      console.error("Get creator requests error:", error);
      res.status(500).json({ error: "Failed to fetch creator requests" });
    }
  },

  // Approve a creator request (admin only)
  async approveCreatorRequest(req, res) {
    try {
      // In a real app, check if user is admin
      // if (!req.user.isAdmin) {
      //   return res.status(403).json({ error: "Unauthorized. Admin access required." });
      // }

      const { requestId } = req.params;

      // Find the request
      const request = await prisma.creatorRequest.findUnique({
        where: { id: requestId },
      });

      if (!request) {
        return res.status(404).json({ error: "Creator request not found" });
      }

      if (request.status !== "PENDING") {
        return res.status(400).json({
          error: "This request has already been processed",
          status: request.status,
        });
      }

      // Use a transaction to update both the request and user
      const result = await prisma.$transaction([
        // Update the request status
        prisma.creatorRequest.update({
          where: { id: requestId },
          data: {
            status: "APPROVED",
            updatedAt: new Date(),
          },
        }),
        // Update the user's creator status
        prisma.user.update({
          where: { id: request.userId },
          data: { isCreator: true },
        }),
      ]);

      res.json({
        message: "Creator request approved successfully",
        request: result[0],
      });
    } catch (error) {
      console.error("Approve creator request error:", error);
      res.status(500).json({ error: "Failed to approve creator request" });
    }
  },

  // Reject a creator request (admin only)
  async rejectCreatorRequest(req, res) {
    try {
      // In a real app, check if user is admin
      // if (!req.user.isAdmin) {
      //   return res.status(403).json({ error: "Unauthorized. Admin access required." });
      // }

      const { requestId } = req.params;
      const { reason } = req.body; // Optional rejection reason

      // Find the request
      const request = await prisma.creatorRequest.findUnique({
        where: { id: requestId },
      });

      if (!request) {
        return res.status(404).json({ error: "Creator request not found" });
      }

      if (request.status !== "PENDING") {
        return res.status(400).json({
          error: "This request has already been processed",
          status: request.status,
        });
      }

      // Update the request status
      const updatedRequest = await prisma.creatorRequest.update({
        where: { id: requestId },
        data: {
          status: "REJECTED",
          reason,
          updatedAt: new Date(),
        },
      });

      res.json({
        message: "Creator request rejected successfully",
        request: updatedRequest,
      });
    } catch (error) {
      console.error("Reject creator request error:", error);
      res.status(500).json({ error: "Failed to reject creator request" });
    }
  },

  // Upload avatar
  async uploadAvatar(req, res) {
    try {
      const userId = req.user.userId;

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Update the path to match what the client would use to access it
      const avatarPath = `/users/images/${userId}/user_avatar.jpeg`;

      // Add a timestamp to force browser cache refresh
      const timestamp = Date.now();
      const avatarUrlWithCache = `${avatarPath}?t=${timestamp}`;

      await prisma.user.update({
        where: { id: userId },
        data: { avatar: avatarPath },
      });

      res.status(200).json({
        message: "Avatar uploaded successfully",
        avatarUrl: avatarUrlWithCache,
      });
    } catch (error) {
      console.error("Avatar upload error:", error);
      res.status(500).json({ error: "Failed to upload avatar" });
    }
  },
};

module.exports = userController;
