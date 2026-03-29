import { io } from "socket.io-client";
import { API_HOST } from "./api";
import { makeReactionTargetKey } from "../utils/reactions";

export const REALTIME_EVENTS = {
  notificationNew: "notification:new",
  reactionUpdated: "reaction:updated",
  chapterPresence: "chapter:presence",
  commentCreated: "comment:created",
  commentDeleted: "comment:deleted",
};

export const REALTIME_ACTIONS = {
  reactionSubscribe: "reaction:subscribe",
  reactionUnsubscribe: "reaction:unsubscribe",
  chapterPresenceSubscribe: "chapter:presence:subscribe",
  chapterPresenceUnsubscribe: "chapter:presence:unsubscribe",
  commentSubscribe: "comment:subscribe",
  commentUnsubscribe: "comment:unsubscribe",
};

let socket = null;
let currentToken = null;
const reactionSubscriptions = new Map();
const chapterPresenceSubscriptions = new Map();
const commentSubscriptions = new Map();

function normalizeToken(token) {
  const value = String(token || "").trim();
  if (!value) {
    return null;
  }

  if (value.toLowerCase().startsWith("bearer ")) {
    return value.slice(7).trim() || null;
  }

  return value;
}

function normalizeReactionTargets(targets) {
  const items = Array.isArray(targets) ? targets : [targets];
  return items
    .map((target) => {
      const targetType = String(target?.targetType || "").trim().toUpperCase();
      const targetId = String(target?.targetId || "").trim();
      if (!targetType || !targetId) {
        return null;
      }

      return {
        targetType,
        targetId,
      };
    })
    .filter(Boolean);
}

function rejoinReactionTargets() {
  if (!socket || reactionSubscriptions.size === 0) {
    return;
  }

  socket.emit(REALTIME_ACTIONS.reactionSubscribe, {
    targets: Array.from(reactionSubscriptions.values()).map((entry) => entry.target),
  });
}

function normalizeChapterPresenceTargets(targets) {
  const items = Array.isArray(targets) ? targets : [targets];
  return items
    .map((target) => {
      const storyId = String(target?.storyId || "").trim();
      const chapterId = String(target?.chapterId || "").trim();
      if (!storyId || !chapterId) {
        return null;
      }

      return {
        storyId,
        chapterId,
      };
    })
    .filter(Boolean);
}

function makeChapterPresenceKey(storyId, chapterId) {
  return `${String(storyId || "").trim()}::${String(chapterId || "").trim()}`;
}

function normalizePageIndex(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function normalizeCommentTargets(targets) {
  const items = Array.isArray(targets) ? targets : [targets];
  return items
    .map((target) => {
      const scope = String(target?.scope || "").trim().toUpperCase();
      if (!scope) {
        return null;
      }

      if (scope === "STORY") {
        const storyId = String(target?.storyId || "").trim();
        return storyId ? { scope, storyId } : null;
      }

      if (scope === "CHAPTER") {
        const chapterId = String(target?.chapterId || "").trim();
        return chapterId ? { scope, chapterId } : null;
      }

      if (scope === "PAGE") {
        const chapterId = String(target?.chapterId || "").trim();
        const pageIndex = normalizePageIndex(target?.pageIndex);
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
    })
    .filter(Boolean);
}

function makeCommentTargetKey(target) {
  if (target?.scope === "STORY") {
    return `STORY::${target.storyId}`;
  }

  if (target?.scope === "CHAPTER") {
    return `CHAPTER::${target.chapterId}`;
  }

  return `PAGE::${target?.chapterId}::${target?.pageIndex}`;
}

function rejoinChapterPresenceTargets() {
  if (!socket || chapterPresenceSubscriptions.size === 0) {
    return;
  }

  socket.emit(REALTIME_ACTIONS.chapterPresenceSubscribe, {
    targets: Array.from(chapterPresenceSubscriptions.values()).map(
      (entry) => entry.target,
    ),
  });
}

function rejoinCommentTargets() {
  if (!socket || commentSubscriptions.size === 0) {
    return;
  }

  socket.emit(REALTIME_ACTIONS.commentSubscribe, {
    targets: Array.from(commentSubscriptions.values()).map((entry) => entry.target),
  });
}

export function connectRealtime(token = null) {
  const normalizedToken = normalizeToken(token);
  if (socket && currentToken === normalizedToken) {
    return socket;
  }

  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  currentToken = normalizedToken;
  socket = io(API_HOST, {
    auth: normalizedToken
      ? {
          token: normalizedToken,
        }
      : {},
    reconnection: true,
  });

  socket.on("connect", () => {
    rejoinReactionTargets();
    rejoinChapterPresenceTargets();
    rejoinCommentTargets();
  });

  return socket;
}

export function disconnectRealtime() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  currentToken = null;
  reactionSubscriptions.clear();
  chapterPresenceSubscriptions.clear();
  commentSubscriptions.clear();
}

export function subscribeReactionTargets(targets, token = null) {
  const normalizedTargets = normalizeReactionTargets(targets);
  if (!normalizedTargets.length) {
    return null;
  }

  const activeSocket = connectRealtime(token);
  const freshTargets = [];

  normalizedTargets.forEach((target) => {
    const key = makeReactionTargetKey(target.targetType, target.targetId);
    const existing = reactionSubscriptions.get(key);

    if (existing) {
      existing.count += 1;
      return;
    }

    reactionSubscriptions.set(key, {
      count: 1,
      target,
    });
    freshTargets.push(target);
  });

  if (freshTargets.length && activeSocket?.connected) {
    activeSocket.emit(REALTIME_ACTIONS.reactionSubscribe, {
      targets: freshTargets,
    });
  }

  return activeSocket;
}

export function unsubscribeReactionTargets(targets) {
  const normalizedTargets = normalizeReactionTargets(targets);
  if (!normalizedTargets.length) {
    return;
  }

  const removableTargets = [];

  normalizedTargets.forEach((target) => {
    const key = makeReactionTargetKey(target.targetType, target.targetId);
    const existing = reactionSubscriptions.get(key);
    if (!existing) {
      return;
    }

    if (existing.count > 1) {
      existing.count -= 1;
      return;
    }

    reactionSubscriptions.delete(key);
    removableTargets.push(target);
  });

  if (removableTargets.length && socket) {
    socket.emit(REALTIME_ACTIONS.reactionUnsubscribe, {
      targets: removableTargets,
    });
  }
}

export function subscribeChapterPresence(targets, token = null) {
  const normalizedTargets = normalizeChapterPresenceTargets(targets);
  if (!normalizedTargets.length) {
    return null;
  }

  const activeSocket = connectRealtime(token);
  const freshTargets = [];

  normalizedTargets.forEach((target) => {
    const key = makeChapterPresenceKey(target.storyId, target.chapterId);
    const existing = chapterPresenceSubscriptions.get(key);

    if (existing) {
      existing.count += 1;
      return;
    }

    chapterPresenceSubscriptions.set(key, {
      count: 1,
      target,
    });
    freshTargets.push(target);
  });

  if (freshTargets.length && activeSocket?.connected) {
    activeSocket.emit(REALTIME_ACTIONS.chapterPresenceSubscribe, {
      targets: freshTargets,
    });
  }

  return activeSocket;
}

export function unsubscribeChapterPresence(targets) {
  const normalizedTargets = normalizeChapterPresenceTargets(targets);
  if (!normalizedTargets.length) {
    return;
  }

  const removableTargets = [];

  normalizedTargets.forEach((target) => {
    const key = makeChapterPresenceKey(target.storyId, target.chapterId);
    const existing = chapterPresenceSubscriptions.get(key);
    if (!existing) {
      return;
    }

    if (existing.count > 1) {
      existing.count -= 1;
      return;
    }

    chapterPresenceSubscriptions.delete(key);
    removableTargets.push(target);
  });

  if (removableTargets.length && socket) {
    socket.emit(REALTIME_ACTIONS.chapterPresenceUnsubscribe, {
      targets: removableTargets,
    });
  }
}

export function subscribeCommentTargets(targets, token = null) {
  const normalizedTargets = normalizeCommentTargets(targets);
  if (!normalizedTargets.length) {
    return null;
  }

  const activeSocket = connectRealtime(token);
  const freshTargets = [];

  normalizedTargets.forEach((target) => {
    const key = makeCommentTargetKey(target);
    const existing = commentSubscriptions.get(key);

    if (existing) {
      existing.count += 1;
      return;
    }

    commentSubscriptions.set(key, {
      count: 1,
      target,
    });
    freshTargets.push(target);
  });

  if (freshTargets.length && activeSocket?.connected) {
    activeSocket.emit(REALTIME_ACTIONS.commentSubscribe, {
      targets: freshTargets,
    });
  }

  return activeSocket;
}

export function unsubscribeCommentTargets(targets) {
  const normalizedTargets = normalizeCommentTargets(targets);
  if (!normalizedTargets.length) {
    return;
  }

  const removableTargets = [];

  normalizedTargets.forEach((target) => {
    const key = makeCommentTargetKey(target);
    const existing = commentSubscriptions.get(key);
    if (!existing) {
      return;
    }

    if (existing.count > 1) {
      existing.count -= 1;
      return;
    }

    commentSubscriptions.delete(key);
    removableTargets.push(target);
  });

  if (removableTargets.length && socket) {
    socket.emit(REALTIME_ACTIONS.commentUnsubscribe, {
      targets: removableTargets,
    });
  }
}
