const prisma = require("../db");
const {
  getReactionCounts,
  getUserReaction,
} = require("../services/reactionService");

const VALID_REACTION_TYPES = ["LIKE", "LOVE", "HAHA", "WOW", "SAD", "ANGRY"];

/**
 * Handles reactions for different content types using a polymorphic approach
 */
exports.handleReaction = async (req, res) => {
  const { reactionType } = req.body;
  const authorId = req.user?.userId;

  // --- Dynamic target determination ---
  const { targetId, targetType } = determineTargetInfo(req);

  // --- Input Validation ---
  if (!authorId) {
    return res.status(403).json({ error: "User not authenticated." });
  }

  if (!targetId || !targetType) {
    return res.status(400).json({ error: "Invalid target information." });
  }

  const upperReactionType =
    reactionType && typeof reactionType === "string"
      ? reactionType.toUpperCase()
      : undefined;

  if (upperReactionType && !VALID_REACTION_TYPES.includes(upperReactionType)) {
    return res.status(400).json({ error: "Invalid reaction type." });
  }

  console.log(
    `[Handle Reaction] User: ${authorId}, ${targetType}: ${targetId}, Type: ${
      upperReactionType || "(removing)"
    }`
  );

  try {
    // Check permissions
    const hasPermission = await checkPermissions(
      authorId,
      targetId,
      targetType
    );
    if (!hasPermission) {
      return res
        .status(403)
        .json({
          error: `You do not have permission to react to this ${targetType.toLowerCase()}.`,
        });
    }

    // Define the unique condition for the reaction using the polymorphic key
    const reactionWhereUniqueInput = {
      authorId_targetId_targetType: {
        authorId: authorId,
        targetId: targetId,
        targetType: targetType,
      },
    };

    // Handle Reaction Logic (Upsert or Delete)
    let message = "";
    if (upperReactionType) {
      // Add or Update reaction using polymorphic fields
      await prisma.reaction.upsert({
        where: reactionWhereUniqueInput,
        update: { type: upperReactionType },
        create: {
          type: upperReactionType,
          authorId: authorId,
          targetId: targetId,
          targetType: targetType,
        },
      });
      message = "Reaction saved.";
    } else {
      // Remove reaction (if it exists) using polymorphic key
      try {
        await prisma.reaction.delete({
          where: reactionWhereUniqueInput,
        });
        message = "Reaction removed.";
      } catch (error) {
        if (error.code === "P2025") {
          // If reaction didn't exist, it's effectively removed
          message = "Reaction not found (already removed).";
        } else {
          throw error; // Re-throw other errors
        }
      }
    }

    // Fetch updated reaction state *after* the operation using service functions
    const updatedReactionCounts = await getReactionCounts(targetId, targetType);
    const updatedUserReaction = await getUserReaction(
      authorId,
      targetId,
      targetType
    );

    // Send successful response
    res.status(200).json({
      message: message,
      reactionCounts: updatedReactionCounts,
      userReaction: updatedUserReaction,
    });
  } catch (error) {
    console.error(
      `Error handling reaction for ${targetType} ${targetId}:`,
      error
    );
    res.status(500).json({ error: "Failed to process reaction." });
  }
};

/**
 * Determines the target type and ID based on the request parameters
 */
function determineTargetInfo(req) {
  // Check for post reactions
  if (
    req.params.postId &&
    req.baseUrl.includes("/api/posts") &&
    !req.path.includes("/media/")
  ) {
    return { targetId: req.params.postId, targetType: "Post" };
  }

  // Check for media item reactions
  if (req.params.mediaId && req.path.includes("/media/")) {
    return { targetId: req.params.mediaId, targetType: "PostMediaItem" };
  }

  // Check for comment reactions
  if (req.params.commentId && req.baseUrl.includes("/api/comments")) {
    return { targetId: req.params.commentId, targetType: "Comment" };
  }

  // Add more content types as needed

  return { targetId: null, targetType: null };
}

/**
 * Checks if the user has permission to react to the target
 */
async function checkPermissions(authorId, targetId, targetType) {
  try {
    // Check permissions based on the target type
    switch (targetType) {
      case "Post":
        return await checkPostPermissions(authorId, targetId);

      case "PostMediaItem":
        return await checkMediaItemPermissions(authorId, targetId);

      case "Comment":
        return await checkCommentPermissions(authorId, targetId);

      // Add more content types as needed

      default:
        return false;
    }
  } catch (error) {
    console.error(
      `Error checking permissions for ${targetType} ${targetId}:`,
      error
    );
    return false;
  }
}

/**
 * Checks if the user has permission to react to a post
 */
async function checkPostPermissions(authorId, postId) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { visibility: true, authorId: true },
  });

  if (!post) return false;

  if (post.visibility === "PUBLIC") {
    return true;
  } else if (post.visibility === "SUBSCRIBERS") {
    if (post.authorId === authorId) {
      return true; // Author can always interact
    } else {
      // Check if the current user follows the post author
      const postAuthorDetails = await prisma.user.findUnique({
        where: { id: post.authorId },
        select: {
          users_B: {
            where: { id: authorId },
            select: { id: true },
          },
        },
      });
      return postAuthorDetails?.users_B?.length > 0;
    }
  }

  return false;
}

/**
 * Checks if the user has permission to react to a media item
 */
async function checkMediaItemPermissions(authorId, mediaId) {
  // For media items, we check the parent post's permissions
  const mediaItem = await prisma.postMediaItem.findUnique({
    where: { id: mediaId },
    select: {
      postId: true,
    },
  });

  if (!mediaItem) return false;

  // Reuse the post permission check logic
  return await checkPostPermissions(authorId, mediaItem.postId);
}

/**
 * Checks if the user has permission to react to a comment
 */
async function checkCommentPermissions(authorId, commentId) {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: {
      postId: true,
    },
  });

  if (!comment) return false;

  // For comments, we check the parent post's permissions
  return await checkPostPermissions(authorId, comment.postId);
}
