const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const env = require("../config/env");
const { isAllowedOrigin } = require("../config/cors");
const { VALID_TARGET_TYPES } = require("../models/reaction");
const { serializeDoc } = require("../utils/serialize");

const NEW_NOTIFICATION_EVENT = "notification:new";
const REACTION_UPDATED_EVENT = "reaction:updated";
const REACTION_SUBSCRIBE_EVENT = "reaction:subscribe";
const REACTION_UNSUBSCRIBE_EVENT = "reaction:unsubscribe";
const CHAPTER_PRESENCE_EVENT = "chapter:presence";
const CHAPTER_PRESENCE_SUBSCRIBE_EVENT = "chapter:presence:subscribe";
const CHAPTER_PRESENCE_UNSUBSCRIBE_EVENT = "chapter:presence:unsubscribe";
const COMMENT_CREATED_EVENT = "comment:created";
const COMMENT_DELETED_EVENT = "comment:deleted";
const COMMENT_SUBSCRIBE_EVENT = "comment:subscribe";
const COMMENT_UNSUBSCRIBE_EVENT = "comment:unsubscribe";

let io = null;

function getUserRoom(userId) {
  return `user:${String(userId || "").trim()}`;
}

function normalizeReactionTarget(input) {
  const targetType = String(input?.targetType || "").trim().toUpperCase();
  const targetId = String(input?.targetId || "").trim();

  if (!VALID_TARGET_TYPES.includes(targetType) || !targetId) {
    return null;
  }

  return {
    targetType,
    targetId,
  };
}

function getReactionRoom(targetType, targetId) {
  return `reaction:${targetType}:${targetId}`;
}

function normalizeChapterPresenceTarget(input) {
  const storyId = String(input?.storyId || "").trim();
  const chapterId = String(input?.chapterId || "").trim();
  if (!storyId || !chapterId) {
    return null;
  }

  return {
    storyId,
    chapterId,
  };
}

function getChapterPresenceRoom(storyId, chapterId) {
  return `chapter:${storyId}:${chapterId}`;
}

function normalizePageIndex(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function normalizeCommentTarget(input) {
  const scope = String(input?.scope || "").trim().toUpperCase();
  if (!scope) {
    return null;
  }

  if (scope === "STORY") {
    const storyId = String(input?.storyId || "").trim();
    return storyId ? { scope, storyId } : null;
  }

  if (scope === "CHAPTER") {
    const chapterId = String(input?.chapterId || "").trim();
    return chapterId ? { scope, chapterId } : null;
  }

  if (scope === "PAGE") {
    const chapterId = String(input?.chapterId || "").trim();
    const pageIndex = normalizePageIndex(input?.pageIndex);
    if (!chapterId || pageIndex === null) {
      return null;
    }

    return {
      scope,
      chapterId,
      pageIndex,
    };
  }

  return null;
}

function getCommentRoom(target) {
  if (target?.scope === "STORY") {
    return `comment:story:${target.storyId}`;
  }

  if (target?.scope === "CHAPTER") {
    return `comment:chapter:${target.chapterId}`;
  }

  if (target?.scope === "PAGE") {
    return `comment:page:${target.chapterId}:${target.pageIndex}`;
  }

  return null;
}

function getCommentTargetsForComment(comment) {
  const storyId = String(comment?.storyId || "").trim();
  const chapterId = String(comment?.chapterId || "").trim();
  const pageIndex = normalizePageIndex(comment?.pageIndex);

  if (chapterId && pageIndex !== null) {
    return [
      {
        scope: "PAGE",
        chapterId,
        pageIndex,
      },
    ];
  }

  if (chapterId) {
    return [
      {
        scope: "CHAPTER",
        chapterId,
      },
    ];
  }

  if (storyId) {
    return [
      {
        scope: "STORY",
        storyId,
      },
    ];
  }

  return [];
}

function joinCommentTargets(socket, payload) {
  const targets = Array.isArray(payload?.targets) ? payload.targets : [payload];
  targets
    .map(normalizeCommentTarget)
    .filter(Boolean)
    .forEach((target) => {
      const room = getCommentRoom(target);
      if (room) {
        socket.join(room);
      }
    });
}

function leaveCommentTargets(socket, payload) {
  const targets = Array.isArray(payload?.targets) ? payload.targets : [payload];
  targets
    .map(normalizeCommentTarget)
    .filter(Boolean)
    .forEach((target) => {
      const room = getCommentRoom(target);
      if (room) {
        socket.leave(room);
      }
    });
}

function getChapterPresencePayload(target) {
  const normalizedTarget = normalizeChapterPresenceTarget(target);
  if (!normalizedTarget) {
    return null;
  }

  const room = getChapterPresenceRoom(
    normalizedTarget.storyId,
    normalizedTarget.chapterId,
  );

  return {
    ...normalizedTarget,
    room,
    count: io?.sockets?.adapter?.rooms?.get(room)?.size || 0,
  };
}

function emitChapterPresence(target) {
  const payload = getChapterPresencePayload(target);
  if (!io || !payload) {
    return;
  }

  io.to(payload.room).emit(CHAPTER_PRESENCE_EVENT, {
    storyId: payload.storyId,
    chapterId: payload.chapterId,
    count: payload.count,
  });
}

function queueChapterPresenceEmit(target) {
  setImmediate(() => {
    emitChapterPresence(target);
  });
}

function joinChapterPresence(socket, payload) {
  const targets = Array.isArray(payload?.targets) ? payload.targets : [payload];
  targets
    .map(normalizeChapterPresenceTarget)
    .filter(Boolean)
    .forEach((target) => {
      socket.join(getChapterPresenceRoom(target.storyId, target.chapterId));
      emitChapterPresence(target);
    });
}

function leaveChapterPresence(socket, payload) {
  const targets = Array.isArray(payload?.targets) ? payload.targets : [payload];
  targets
    .map(normalizeChapterPresenceTarget)
    .filter(Boolean)
    .forEach((target) => {
      socket.leave(getChapterPresenceRoom(target.storyId, target.chapterId));
      queueChapterPresenceEmit(target);
    });
}

function parseChapterPresenceRoom(room) {
  const value = String(room || "").trim();
  if (!value.startsWith("chapter:")) {
    return null;
  }

  const parts = value.split(":");
  if (parts.length !== 3) {
    return null;
  }

  return normalizeChapterPresenceTarget({
    storyId: parts[1],
    chapterId: parts[2],
  });
}

function joinReactionTargets(socket, payload) {
  const targets = Array.isArray(payload?.targets) ? payload.targets : [payload];
  targets
    .map(normalizeReactionTarget)
    .filter(Boolean)
    .forEach(({ targetType, targetId }) => {
      socket.join(getReactionRoom(targetType, targetId));
    });
}

function leaveReactionTargets(socket, payload) {
  const targets = Array.isArray(payload?.targets) ? payload.targets : [payload];
  targets
    .map(normalizeReactionTarget)
    .filter(Boolean)
    .forEach(({ targetType, targetId }) => {
      socket.leave(getReactionRoom(targetType, targetId));
    });
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
      socket.data.user = null;
      return next();
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
    if (userId) {
      socket.join(getUserRoom(userId));
    }

    socket.on(REACTION_SUBSCRIBE_EVENT, (payload) => {
      joinReactionTargets(socket, payload);
    });

    socket.on(REACTION_UNSUBSCRIBE_EVENT, (payload) => {
      leaveReactionTargets(socket, payload);
    });

    socket.on(CHAPTER_PRESENCE_SUBSCRIBE_EVENT, (payload) => {
      joinChapterPresence(socket, payload);
    });

    socket.on(CHAPTER_PRESENCE_UNSUBSCRIBE_EVENT, (payload) => {
      leaveChapterPresence(socket, payload);
    });

    socket.on(COMMENT_SUBSCRIBE_EVENT, (payload) => {
      joinCommentTargets(socket, payload);
    });

    socket.on(COMMENT_UNSUBSCRIBE_EVENT, (payload) => {
      leaveCommentTargets(socket, payload);
    });

    socket.on("disconnecting", () => {
      Array.from(socket.rooms || [])
        .map(parseChapterPresenceRoom)
        .filter(Boolean)
        .forEach((target) => {
          queueChapterPresenceEmit(target);
        });
    });
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

function emitReactionUpdated({
  targetType,
  targetId,
  summary,
  actorUserId = null,
  actorEmotion = null,
}) {
  const target = normalizeReactionTarget({ targetType, targetId });
  if (!io || !target || !summary) {
    return;
  }

  io.to(getReactionRoom(target.targetType, target.targetId)).emit(
    REACTION_UPDATED_EVENT,
    {
      targetType: target.targetType,
      targetId: target.targetId,
      summary,
      actorUserId: actorUserId ? String(actorUserId) : null,
      actorEmotion: actorEmotion || null,
    },
  );
}

function emitCommentCreated(comment) {
  if (!io || !comment) {
    return;
  }

  getCommentTargetsForComment(comment).forEach((target) => {
    const room = getCommentRoom(target);
    if (!room) {
      return;
    }

    io.to(room).emit(COMMENT_CREATED_EVENT, {
      ...target,
      comment,
    });
  });
}

function emitCommentDeleted(comment) {
  if (!io || !comment?.id) {
    return;
  }

  getCommentTargetsForComment(comment).forEach((target) => {
    const room = getCommentRoom(target);
    if (!room) {
      return;
    }

    io.to(room).emit(COMMENT_DELETED_EVENT, {
      ...target,
      commentId: String(comment.id),
    });
  });
}

module.exports = {
  NEW_NOTIFICATION_EVENT,
  REACTION_SUBSCRIBE_EVENT,
  REACTION_UNSUBSCRIBE_EVENT,
  REACTION_UPDATED_EVENT,
  CHAPTER_PRESENCE_EVENT,
  CHAPTER_PRESENCE_SUBSCRIBE_EVENT,
  CHAPTER_PRESENCE_UNSUBSCRIBE_EVENT,
  COMMENT_CREATED_EVENT,
  COMMENT_DELETED_EVENT,
  COMMENT_SUBSCRIBE_EVENT,
  COMMENT_UNSUBSCRIBE_EVENT,
  emitNotificationCreated,
  emitNotificationsCreated,
  emitReactionUpdated,
  emitCommentCreated,
  emitCommentDeleted,
  initializeRealtime,
};
