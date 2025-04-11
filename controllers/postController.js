const prisma = require("../db"); // Assuming Prisma client is available via ../db
const fs = require("fs").promises; // Import fs.promises
const path = require("path"); // Import path

// Placeholder for file saving logic - replace with actual storage (e.g., S3, Cloudinary)
const saveMediaFiles = async (files) => {
  if (!files || files.length === 0) {
    return [];
  }
  console.warn(
    "Media file saving not implemented. Files were processed by multer but not saved permanently."
  );
  // In a real app, upload files to cloud storage here and return their URLs
  // Example structure:
  // const uploadPromises = files.map(file => uploadToCloud(file));
  // const urls = await Promise.all(uploadPromises);
  // return urls;
  return files.map((file) => `placeholder_url_for_${file.originalname}`); // Return dummy URLs for now
};

exports.createPost = async (req, res) => {
  // Extract standard fields and allowComments
  const {
    content,
    visibility,
    allowComments: allowCommentsStr,
    linkedMedia: linkedMediaJson, // Get linked media JSON string
    uploadedFileTitles: uploadedFileTitlesJson, // Get uploaded file titles JSON string
  } = req.body;
  const allowComments = allowCommentsStr === "false" ? false : true;
  const authorId = req.user?.userId;
  // Use req.files consolidated by the route middleware
  const uploadedFiles = req.files;

  // Parse linkedMedia and uploadedFileTitles safely
  let linkedMedia = [];
  try {
    if (linkedMediaJson) {
      linkedMedia = JSON.parse(linkedMediaJson);
      // Basic validation if needed (e.g., check if it's an array)
      if (!Array.isArray(linkedMedia)) linkedMedia = [];
    }
  } catch (e) {
    console.error("Error parsing linkedMedia JSON:", e);
    // Handle error - maybe return a 400 Bad Request
    return res.status(400).json({ error: "Invalid format for linked media." });
  }

  let uploadedFileTitles = {};
  try {
    if (uploadedFileTitlesJson) {
      uploadedFileTitles = JSON.parse(uploadedFileTitlesJson);
      // Basic validation if needed (e.g., check if it's an object)
      if (
        typeof uploadedFileTitles !== "object" ||
        uploadedFileTitles === null
      ) {
        uploadedFileTitles = {};
      }
    }
  } catch (e) {
    console.error("Error parsing uploadedFileTitles JSON:", e);
    return res
      .status(400)
      .json({ error: "Invalid format for uploaded file titles." });
  }

  // Basic validation
  if (!authorId) {
    console.log(
      "[CreatePost] Failed: User not authenticated (authorId missing)"
    );
    return res.status(403).json({ error: "User not authenticated." });
  }

  console.log("[CreatePost] Authenticated User ID:", authorId);

  // Creator Check
  try {
    console.log(`[CreatePost] Checking creator status for user: ${authorId}`);
    const user = await prisma.user.findUnique({
      where: { id: authorId },
      select: { isCreator: true },
    });

    console.log(`[CreatePost] Found user data: ${JSON.stringify(user)}`);

    if (!user || !user.isCreator) {
      console.log(
        `[CreatePost] Failed: User ${authorId} is not an approved creator. User data: ${JSON.stringify(
          user
        )}`
      );
      return res
        .status(403)
        .json({ error: "Only approved creators can create posts." });
    }

    console.log(`[CreatePost] User ${authorId} is an approved creator.`);
  } catch (checkError) {
    console.error("[CreatePost] Error checking creator status:", checkError);
    return res
      .status(500)
      .json({ error: "Failed to verify user permissions." });
  }

  // Allow posts with only media (uploaded or linked)
  if (
    (!content || content.trim() === "") &&
    uploadedFiles.length === 0 &&
    linkedMedia.length === 0
  ) {
    return res.status(400).json({
      error: "Post must have content, an uploaded file, or a linked media URL.",
    });
  }
  if (content && content.trim() === "") {
    return res
      .status(400)
      .json({ error: "Post content cannot be only whitespace." });
  }

  // Validate visibility if provided, default to PUBLIC
  const validVisibility = ["PUBLIC", "SUBSCRIBERS"];
  const postVisibility =
    visibility && validVisibility.includes(visibility.toUpperCase())
      ? visibility.toUpperCase()
      : "PUBLIC";

  // Prepare a combined array for all media items (uploaded + linked)
  const allMediaItems = [];

  // --- Process Linked Media First ---
  // Add validated linked media items to the list
  linkedMedia.forEach((link) => {
    // Basic validation on link object structure expected from frontend
    if (link && typeof link.url === "string" && typeof link.type === "string") {
      allMediaItems.push({
        source: "link", // Explicitly add source
        media: link.url, // Use 'media' field for consistency
        type: link.type, // Should be 'image', 'video', or 'link'
        title: link.title || null,
      });
    } else {
      console.warn("Skipping invalid linkedMedia item:", link);
    }
  });

  let newPost;
  let postId = null; // Keep track of postId for file saving path
  let savedUploadedMediaObjects = []; // Store results of saved files

  try {
    // 1. Create initial post record in the database (without mediaUrls initially)
    newPost = await prisma.post.create({
      data: {
        content: content || "",
        authorId: authorId,
        visibility: postVisibility,
        allowComments: allowComments,
        // mediaUrls will be added/updated later
      },
    });
    postId = newPost.id;

    // 2. Handle Uploaded File Saving (if files exist)
    if (uploadedFiles && uploadedFiles.length > 0) {
      const uploadPath = path.join(
        __dirname, // Current directory (controllers)
        "..", // Up to server root
        "users",
        "posts",
        authorId,
        postId // Use the created post ID
      );

      try {
        await fs.mkdir(uploadPath, { recursive: true });
      } catch (mkdirError) {
        console.error(`Failed to create directory ${uploadPath}:`, mkdirError);
        throw new Error(`Directory creation failed: ${mkdirError.message}`);
      }

      // Map files based on their original field name (media_0, media_1, etc.)
      const fileSavePromises = uploadedFiles.map(async (file) => {
        // Extract original index from fieldname (e.g., 'media_0' -> '0')
        const match = file.fieldname.match(/^media_(\d+)$/);
        const originalIndex = match ? parseInt(match[1], 10) : null;

        if (originalIndex === null) {
          console.warn(
            `Could not determine original index for file: ${file.originalname}, fieldname: ${file.fieldname}`
          );
          return null; // Skip file if index can't be determined
        }

        const extension = path.extname(file.originalname);
        // Use original index in filename for clarity if needed, or just keep generic
        const newFilename = `upload_${originalIndex}${extension}`;
        const savePath = path.join(uploadPath, newFilename);

        try {
          await fs.writeFile(savePath, file.buffer);
          const relativeUrl = `/users/posts/${authorId}/${postId}/${newFilename}`;
          const type = file.mimetype.startsWith("image/")
            ? "image"
            : file.mimetype.startsWith("video/")
            ? "video"
            : "unknown";

          // Get title using the originalIndex from the parsed uploadedFileTitles map
          const title = uploadedFileTitles[originalIndex] || null;

          // Return object representing the saved upload
          return {
            source: "upload", // Explicitly add source
            media: relativeUrl, // Use 'media' field for consistency
            type: type,
            title: title,
          };
        } catch (writeFileError) {
          console.error(`Failed to write file ${savePath}:`, writeFileError);
          return null;
        }
      });

      const results = await Promise.all(fileSavePromises);
      // Filter out nulls (failed saves or skipped files)
      savedUploadedMediaObjects = results.filter((obj) => obj !== null);

      if (savedUploadedMediaObjects.length !== uploadedFiles.length) {
        console.warn(
          "[CreatePost] Some uploaded media files failed to save or were skipped."
        );
      }
    }

    // 3. Combine saved uploaded media with linked media
    allMediaItems.push(...savedUploadedMediaObjects);

    // 4. Update the post with the final combined mediaUrls
    if (allMediaItems.length > 0) {
      await prisma.post.update({
        where: { id: postId }, // Use postId variable
        data: { mediaUrls: allMediaItems }, // Save the combined array
      });
    } else {
      // If after processing, there are no media items, ensure mediaUrls is an empty array
      await prisma.post.update({
        where: { id: postId },
        data: { mediaUrls: [] },
      });
    }

    // 5. Fetch the final post data including the updated mediaUrls
    const finalPost = await prisma.post.findUnique({
      where: { id: newPost.id },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
      },
    });

    // 6. Send response
    res.status(201).json(finalPost);
  } catch (error) {
    console.error("Error creating post:", error);
    // Simple cleanup attempt: if post record was created but file saving failed, delete the record
    if (newPost && newPost.id) {
      try {
        await prisma.post.delete({ where: { id: newPost.id } });
        // console.log(`Cleaned up partially created post record: ${newPost.id}`);
      } catch (cleanupError) {
        console.error(
          `Failed to cleanup post record ${newPost.id}:`,
          cleanupError
        );
      }
    }
    res.status(500).json({ error: "Failed to create post." });
  }
};

// Controller to get all posts
exports.getAllPosts = async (req, res) => {
  const currentUserId = req.user?.userId; // Get requesting user's ID if authenticated
  const authorIdFromQuery = req.query.authorId; // Get authorId from query param (Corrected from userId)

  console.log(
    `Getting posts, authenticated user: ${currentUserId || "Not authenticated"}`
  );

  try {
    // Prepare the where clause for the Prisma query
    const whereClause = {};
    if (authorIdFromQuery) {
      whereClause.authorId = authorIdFromQuery; // Filter by author if authorId is provided
    }

    // Get posts (filtered or all) with author, comments, and *all* reactions
    const posts = await prisma.post.findMany({
      where: whereClause, // Apply the constructed where clause
      orderBy: {
        createdAt: "desc",
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
        reactions: {
          // Include all reactions for counting
          select: {
            type: true,
            authorId: true, // Need authorId to find current user's reaction
          },
        },
        _count: {
          select: { comments: true },
        },
      },
    });

    console.log(`Found ${posts.length} posts`);

    // Process posts to add reaction counts, user's reaction, and interaction permissions
    const processedPosts = await Promise.all(
      posts.map(async (post) => {
        // Initialize reactionCounts
        const reactionCounts = {};
        let userReaction = null;

        // Calculate reaction counts and find user's reaction
        for (const reaction of post.reactions) {
          reactionCounts[reaction.type] =
            (reactionCounts[reaction.type] || 0) + 1;
          if (currentUserId && reaction.authorId === currentUserId) {
            userReaction = reaction.type;
          }
        }

        // Determine if the current user can interact (react/comment) with the post
        // Always allow public posts to be viewed by everyone, regardless of authentication
        let canInteract = false;
        if (!currentUserId) {
          // Unauthenticated users can only view posts, not interact
          canInteract = false;
        } else if (post.visibility === "PUBLIC") {
          canInteract = true; // Authenticated users can interact with public posts
        } else if (post.visibility === "SUBSCRIBERS" && currentUserId) {
          if (post.authorId === currentUserId) {
            canInteract = true; // Author can always interact
          } else {
            // Check if the current user follows the post author
            const postAuthorDetails = await prisma.user.findUnique({
              where: { id: post.authorId },
              select: {
                users_B: {
                  where: { id: currentUserId },
                  select: { id: true },
                },
              },
            });
            canInteract = postAuthorDetails?.users_B?.length > 0;
          }
        }

        // Remove the full reactions array from the response
        const { reactions, ...restOfPost } = post;

        // Return enhanced post data
        return {
          ...restOfPost,
          reactionCounts,
          userReaction,
          commentCount: post._count.comments,
          canInteract,
        };
      })
    );

    res.status(200).json(processedPosts); // Send processed posts
  } catch (error) {
    console.error("Error fetching posts:", error);
    res.status(500).json({ error: "Failed to fetch posts." });
  }
};

// Controller to create a new comment on a post
exports.createComment = async (req, res) => {
  const { content } = req.body;
  const { postId } = req.params;
  const authorId = req.user?.id;

  // --- Input Validation ---
  if (!authorId) {
    return res.status(403).json({ error: "User not authenticated." });
  }
  if (!content || content.trim() === "") {
    return res.status(400).json({ error: "Comment content cannot be empty." });
  }
  if (!postId) {
    return res.status(400).json({ error: "Post ID is required." });
  }

  try {
    // 1. Check if the post exists and allows comments
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, allowComments: true }, // Only select needed fields
    });

    if (!post) {
      return res.status(404).json({ error: "Post not found." });
    }

    if (!post.allowComments) {
      return res
        .status(403)
        .json({ error: "Comments are disabled for this post." });
    }

    // 2. Create the comment
    const newComment = await prisma.comment.create({
      data: {
        content: content.trim(),
        authorId: authorId,
        postId: postId,
      },
      include: {
        author: {
          // Include author info in the response
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
      },
    });

    // 3. Send Response
    res.status(201).json(newComment);
  } catch (error) {
    console.error(`Error creating comment for post ${postId}:`, error);
    // Check for specific Prisma errors if needed, e.g., Foreign Key Constraint
    if (error.code === "P2003") {
      // Foreign key constraint failed
      return res.status(404).json({ error: "Post or User not found." });
    }
    res.status(500).json({ error: "Failed to create comment." });
  }
};

// Helper function to get updated reaction counts for a post
const getReactionCounts = async (postId) => {
  const reactions = await prisma.reaction.findMany({
    where: { postId: postId },
    select: { type: true },
  });
  const counts = {};
  reactions.forEach((r) => {
    counts[r.type] = (counts[r.type] || 0) + 1;
  });
  return counts;
};

// Helper function to get the current user's reaction to a post
const getUserReaction = async (postId, userId) => {
  if (!userId) return null;
  const reaction = await prisma.reaction.findUnique({
    where: {
      authorId_postId: {
        authorId: userId,
        postId: postId,
      },
    },
    select: { type: true },
  });
  return reaction?.type || null;
};

// Controller to handle adding/updating/removing a reaction on a post
exports.handleReaction = async (req, res) => {
  // Log the req.user object as soon as the function starts
  console.log("\n[Handle Reaction] req.user:", req.user);

  const { reactionType } = req.body;
  const { postId } = req.params;
  const authorId = req.user?.userId;

  console.log("[Handle Reaction] Extracted authorId:", authorId); // Log extracted ID
  // Log the actual boolean value being checked
  console.log("[Handle Reaction] Boolean check (!authorId):", !authorId);

  // --- Input Validation ---
  if (!authorId) {
    return res.status(403).json({ error: "User not authenticated." });
  }
  if (!postId) {
    return res.status(400).json({ error: "Post ID is required." });
  }

  // Validate reactionType (must be one of the enum values or null/empty)
  const validReactionTypes = ["LIKE", "LOVE", "HAHA", "WOW", "SAD", "ANGRY"];
  const upperReactionType = reactionType
    ? String(reactionType).toUpperCase()
    : null;

  if (upperReactionType && !validReactionTypes.includes(upperReactionType)) {
    return res.status(400).json({ error: "Invalid reaction type." });
  }

  try {
    // 1. Check if the post exists and get visibility/author info
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, visibility: true, authorId: true }, // Fetch visibility and authorId
    });
    if (!post) {
      return res.status(404).json({ error: "Post not found." });
    }

    // 2. Check Visibility/Subscription Permissions
    if (post.visibility === "SUBSCRIBERS") {
      // Allow if the reacting user IS the author of the post
      if (post.authorId !== authorId) {
        // If not the author, check if the reacting user follows the post author
        const postAuthorDetails = await prisma.user.findUnique({
          where: { id: post.authorId },
          select: {
            users_B: {
              // users_B represents followers
              where: { id: authorId }, // Check if reacting user is in the followers list
              select: { id: true },
            },
          },
        });

        const isFollower = postAuthorDetails?.users_B?.length > 0;

        if (!isFollower) {
          return res.status(403).json({
            error: "You must follow the author to react to this post.",
          });
        }
      }
    }

    // 3. Handle Reaction Logic (Upsert or Delete)
    let message = "";
    if (upperReactionType) {
      // Add or Update reaction
      await prisma.reaction.upsert({
        where: {
          authorId_postId: {
            authorId: authorId,
            postId: postId,
          },
        },
        update: { type: upperReactionType },
        create: {
          type: upperReactionType,
          authorId: authorId,
          postId: postId,
        },
      });
      message = "Reaction saved.";
    } else {
      // Remove reaction (if it exists)
      try {
        await prisma.reaction.delete({
          where: {
            authorId_postId: {
              authorId: authorId,
              postId: postId,
            },
          },
        });
        message = "Reaction removed.";
      } catch (error) {
        if (error.code === "P2025") {
          // If reaction didn't exist, it's effectively removed, still fetch counts.
          message = "Reaction not found (already removed).";
        } else {
          throw error; // Re-throw other errors
        }
      }
    }

    // 4. Fetch updated reaction state *after* the operation
    const updatedReactionCounts = await getReactionCounts(postId);
    const updatedUserReaction = await getUserReaction(postId, authorId);

    // 5. Send successful response
    res.status(200).json({
      message: message,
      reactionCounts: updatedReactionCounts,
      userReaction: updatedUserReaction,
    });
  } catch (error) {
    console.error(`Error handling reaction for post ${postId}:`, error);
    // Specific error for unique constraint violation (upsert should handle this, but keep for safety)
    if (error.code === "P2002") {
      return res.status(409).json({ error: "Reaction conflict occurred." });
    }
    res.status(500).json({ error: "Failed to process reaction." });
  }
};
