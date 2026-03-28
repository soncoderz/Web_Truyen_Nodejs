const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const env = require("../config/env");
const { isAllowedOrigin } = require("../config/cors");
const { serializeDoc } = require("../utils/serialize");

const NEW_NOTIFICATION_EVENT = "notification:new";

let io = null;

function getUserRoom(userId) {
  return `user:${String(userId || "").trim()}`;
}

function extractToken(value) {
  const token = String(value || "").trim();
  if (!token) {
    return null;
  }

  if (token.toLowerCase().startsWith("bearer ")) {
    return token.slice(7).trim() || null;
  }

  return token;
}

function initializeRealtime(httpServer) {
  if (io) {
    return io;
  }

  io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (isAllowedOrigin(origin)) {
          return callback(null, true);
        }
        return callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
      methods: ["GET", "POST"],
    },
  });

  io.use((socket, next) => {
    const token =
      extractToken(socket.handshake.auth?.token) ||
      extractToken(socket.handshake.auth?.accessToken) ||
      extractToken(socket.handshake.headers?.authorization);

    if (!token) {
      return next(new Error("Unauthorized"));
    }

    try {
      socket.data.user = jwt.verify(token, env.jwtSecret);
      return next();
    } catch (_error) {
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.user?.id;
    if (!userId) {
      socket.disconnect(true);
      return;
    }

    socket.join(getUserRoom(userId));
  });

  return io;
}

function emitNotificationCreated(notification) {
  if (!io || !notification?.userId) {
    return;
  }

  io.to(getUserRoom(notification.userId)).emit(
    NEW_NOTIFICATION_EVENT,
    serializeDoc(notification),
  );
}

function emitNotificationsCreated(notifications) {
  for (const notification of notifications || []) {
    emitNotificationCreated(notification);
  }
}

module.exports = {
  NEW_NOTIFICATION_EVENT,
  emitNotificationCreated,
  emitNotificationsCreated,
  initializeRealtime,
};
