const prisma = require("../db"); // Assuming Prisma client is in ../db

/**
 * Retrieves the counts of each reaction type for a specific target item.
 * @param {string} targetId - The ID of the target item (e.g., Post ID, Comment ID).
 * @param {string} targetType - The type of the target item (e.g., "Post", "Comment").
 * @returns {Promise<object>} A promise that resolves to an object mapping reaction types to their counts (e.g., { LIKE: 10, LOVE: 5 }). Returns empty object on error or if no reactions.
 */
async function getReactionCounts(targetId, targetType) {
  if (!targetId || !targetType) {
    console.warn("[getReactionCounts] Missing targetId or targetType");
    return {};
  }
  try {
    const countsResult = await prisma.reaction.groupBy({
      by: ["type"],
      where: {
        targetId: targetId,
        targetType: targetType,
      },
      _count: {
        type: true,
      },
    });

    // Format the counts into the desired { TYPE: count } structure
    const reactionCounts = countsResult.reduce((acc, current) => {
      acc[current.type] = current._count.type;
      return acc;
    }, {});

    return reactionCounts;
  } catch (error) {
    console.error(
      `Error getting reaction counts for ${targetType} ${targetId}:`,
      error
    );
    return {}; // Return empty object on error
  }
}

/**
 * Retrieves the specific reaction type a user has made on a target item.
 * @param {string} authorId - The ID of the user whose reaction is being checked.
 * @param {string} targetId - The ID of the target item (e.g., Post ID, Comment ID).
 * @param {string} targetType - The type of the target item (e.g., "Post", "Comment").
 * @returns {Promise<string|null>} A promise that resolves to the reaction type (e.g., "LIKE") or null if the user hasn't reacted or an error occurred.
 */
async function getUserReaction(authorId, targetId, targetType) {
  if (!authorId || !targetId || !targetType) {
    // Don't warn if authorId is missing, as this is expected for unauthenticated users
    if (!targetId || !targetType) {
      console.warn("[getUserReaction] Missing targetId or targetType");
    }
    return null;
  }
  try {
    const reaction = await prisma.reaction.findUnique({
      where: {
        // Use the compound unique index defined in the schema
        authorId_targetId_targetType: {
          authorId: authorId,
          targetId: targetId,
          targetType: targetType,
        },
      },
      select: {
        type: true, // Only select the type
      },
    });
    return reaction ? reaction.type : null;
  } catch (error) {
    console.error(
      `Error getting user reaction for ${authorId} on ${targetType} ${targetId}:`,
      error
    );
    return null; // Return null on error
  }
}

module.exports = { getReactionCounts, getUserReaction };
