import { Server } from "socket.io";
import { Server as HttpServer } from "http";
import prisma from "../db"; // Import Prisma client

interface StreamRoom {
  broadcaster: string;
  viewers: string[];
  streamId: string;
  title?: string;
  category?: string;
}

class WebRTCService {
  private io: Server;
  private rooms: Map<string, StreamRoom>;

  constructor(httpServer: HttpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
      },
    });
    this.rooms = new Map();
    this.setupSocketHandlers();
  }

  private setupSocketHandlers() {
    this.io.on("connection", (socket) => {
      // console.log('[DEBUG] Client connected:', socket.id);

      // Handle stream creation
      socket.on(
        "create-stream",
        async (data: {
          streamId: string;
          userId: string;
          title?: string;
          category?: string;
        }) => {
          const { streamId, userId, title, category } = data;
          // console.log('[DEBUG] Creating stream:', { streamId, userId, title, category });

          // ** Creator Check **
          try {
            const user = await prisma.user.findUnique({
              where: { id: userId },
              select: { isCreator: true },
            });

            if (!user || !user.isCreator) {
              console.log(
                `[Auth] User ${userId} attempted to create stream but is not a creator.`
              );
              socket.emit("stream-creation-failed", {
                error: "Only approved creators can start a stream.",
              });
              return; // Stop processing if not a creator
            }
          } catch (error) {
            console.error(
              `[Auth] Error checking creator status for user ${userId}:`,
              error
            );
            socket.emit("stream-creation-failed", {
              error: "Failed to verify creator status.",
            });
            return; // Stop processing on error
          }
          // ** End Creator Check **

          this.rooms.set(streamId, {
            broadcaster: userId,
            viewers: [],
            streamId,
            title,
            category,
          });
          socket.join(streamId);
          socket.emit("stream-created", { streamId });

          // Notify all clients about the new stream
          this.io.emit("stream-update", this.getActiveStreamsInfo());
          // console.log('[DEBUG] Active streams after creation:', this.getActiveStreamsInfo());
        }
      );

      // Handle viewer joining
      socket.on("join-stream", (data: { streamId: string; userId: string }) => {
        const { streamId, userId } = data;
        // console.log('[DEBUG] User', userId, 'joining stream', streamId);

        const room = this.rooms.get(streamId);

        if (room) {
          room.viewers.push(userId);
          socket.join(streamId);

          // Important: Notify broadcaster a viewer has joined
          // console.log('[DEBUG] Notifying broadcaster that viewer joined');
          socket.to(streamId).emit("viewer-joined", { userId, streamId });

          // This triggers the broadcaster to initiate a connection
          socket.to(streamId).emit("stream-started", { streamId, userId });

          // Update viewer count for all clients
          this.io.emit("stream-update", this.getActiveStreamsInfo());
        } else {
          // console.log('[DEBUG] Stream', streamId, 'not found');
          socket.emit("error", { message: "Stream not found" });
        }
      });

      // Handle WebRTC signaling
      socket.on(
        "offer",
        (data: {
          streamId: string;
          offer: RTCSessionDescriptionInit;
          userId: string;
        }) => {
          // console.log(`Relaying offer from ${socket.id} to stream ${data.streamId}`);
          socket.to(data.streamId).emit("offer", {
            offer: data.offer,
            userId: data.userId || socket.id,
          });
        }
      );

      socket.on(
        "answer",
        (data: {
          streamId: string;
          answer: RTCSessionDescriptionInit;
          userId: string;
        }) => {
          // console.log(`Relaying answer from ${socket.id} to user ${data.userId}`);
          socket.to(data.streamId).emit("answer", {
            answer: data.answer,
            userId: data.userId || socket.id,
          });
        }
      );

      socket.on(
        "ice-candidate",
        (data: {
          streamId: string;
          candidate: RTCIceCandidate;
          userId: string;
        }) => {
          // console.log(`Relaying ICE candidate from ${socket.id} to stream ${data.streamId}`);
          socket.to(data.streamId).emit("ice-candidate", {
            candidate: data.candidate,
            userId: data.userId || socket.id,
          });
        }
      );

      // Handle get active streams request
      socket.on("get-active-streams", (callback) => {
        // console.log('[DEBUG] Client', socket.id, 'requested active streams');
        const activeStreams = this.getActiveStreamsInfo();
        // console.log('[DEBUG] Returning', activeStreams.length, 'active streams:', activeStreams);
        callback(activeStreams);
      });

      // Handle disconnection
      socket.on("disconnect", () => {
        this.handleDisconnect(socket.id);
      });
    });
  }

  private handleDisconnect(socketId: string) {
    // Remove user from all rooms
    this.rooms.forEach((room, streamId) => {
      if (room.broadcaster === socketId) {
        // If broadcaster disconnects, close the stream
        this.io.to(streamId).emit("stream-ended", streamId);
        this.rooms.delete(streamId);

        // Notify all clients about the stream ending
        this.io.emit("stream-update", this.getActiveStreamsInfo());
      } else {
        // Check if the disconnected socket was a viewer
        const viewerIndex = room.viewers.findIndex((id) => id === socketId);
        if (viewerIndex !== -1) {
          // Remove viewer from the stream
          room.viewers.splice(viewerIndex, 1);

          // Update viewer count for all clients
          this.io.emit("stream-update", this.getActiveStreamsInfo());
        }
      }
    });
  }

  private getActiveStreamsInfo() {
    return Array.from(this.rooms.entries()).map(([streamId, room]) => ({
      id: streamId,
      title: room.title || "Untitled Stream",
      viewers: room.viewers.length,
      category: room.category || "Uncategorized",
      streamer: room.broadcaster,
      isLive: true,
    }));
  }

  public getActiveStreams() {
    return Array.from(this.rooms.values());
  }

  public getStream(streamId: string) {
    return this.rooms.get(streamId);
  }
}

export default WebRTCService;
