require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createServer } = require("http");
const { Server } = require("socket.io");
const userRoutes = require("./routes/userRoutes");
const messageRoutes = require("./routes/messageRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const userController = require("./controllers/userController");
const authenticateToken = require("./middleware/authenticateToken");
const activityMiddleware = require("./middleware/activityMiddleware");
const { startInactivityChecker } = require("./services/inactivityChecker");
const bodyParser = require("body-parser");
const path = require("path");

// Import post routes
const postRoutes = require("./routes/postRoutes");

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 5000;

// Store active streams
const activeStreams = new Map();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, "public")));

// Serve user post media from the new location
app.use("/users/posts", express.static(path.join(__dirname, "users", "posts")));

// Serve user avatar images with specific cache control
app.use(
  "/users/images",
  express.static(path.join(__dirname, "public", "users", "images"), {
    setHeaders: (res, path, stat) => {
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.set("Pragma", "no-cache"); // For older browsers
      res.set("Expires", "0"); // For older browsers
    },
  })
);

// Add activity middleware after your auth middleware
app.use(activityMiddleware);

// Routes
app.use("/api/users", userRoutes); // Fixed typo from 'usreRoutes' to 'userRoutes'
app.use("/api/posts", postRoutes); // Add post routes
app.use("/api/messages", messageRoutes); // Add message routes
app.use("/api/notifications", notificationRoutes); // Add notification routes

// Basic route for testing
app.get("/", (req, res) => {
  res.json({ message: "Streaming Server API is running" });
});

// Socket.IO connection handling
io.on("connection", (socket) => {
  // console.log("A user connected:", socket.id);

  // Handle get-active-streams event
  socket.on("get-active-streams", (callback) => {
    // console.log("Client requested active streams");
    const streams = Array.from(activeStreams.values());
    // console.log("Sending active streams:", streams);
    callback(streams);
  });

  // Handle create-stream event
  socket.on("create-stream", ({ streamId, userId }) => {
    // console.log("Creating new stream:", { streamId, userId });
    activeStreams.set(streamId, {
      id: streamId,
      title: "New Stream",
      streamer: userId,
      viewers: 0,
      thumbnail: null,
      category: "Uncategorized",
      isLive: true,
    });
    io.emit("stream-update", Array.from(activeStreams.values()));
  });

  // Handle join-stream event
  socket.on("join-stream", ({ streamId, userId }) => {
    // console.log("User joining stream:", { streamId, userId });
    const stream = activeStreams.get(streamId);
    if (stream) {
      stream.viewers += 1;
      io.emit("stream-update", Array.from(activeStreams.values()));
    }
  });

  // Handle stream-ended event
  socket.on("stream-ended", (streamId) => {
    // console.log("Stream ended:", streamId);
    activeStreams.delete(streamId);
    io.emit("stream-update", Array.from(activeStreams.values()));
  });

  socket.on("disconnect", () => {
    // console.log("User disconnected:", socket.id);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

// Start inactivity checker when server starts
startInactivityChecker();

// Use httpServer.listen instead of app.listen
httpServer.listen(PORT, () => {
  // console.log(`Server is running on port ${PORT}`);
});
