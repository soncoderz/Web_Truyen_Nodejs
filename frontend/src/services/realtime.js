import { io } from "socket.io-client";
import { API_HOST } from "./api";

export const REALTIME_EVENTS = {
  notificationNew: "notification:new",
};

let socket = null;
let currentToken = null;

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

export function connectRealtime(token) {
  const normalizedToken = normalizeToken(token);
  if (!normalizedToken) {
    return null;
  }

  if (socket && currentToken === normalizedToken) {
    return socket;
  }

  disconnectRealtime();
  currentToken = normalizedToken;
  socket = io(API_HOST, {
    auth: {
      token: normalizedToken,
    },
    reconnection: true,
  });

  return socket;
}

export function disconnectRealtime() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  currentToken = null;
}
