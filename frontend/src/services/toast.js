let nextToastId = 1;
let toastQueue = [];

const listeners = new Set();
const timers = new Map();

function emit() {
  listeners.forEach((listener) => listener(toastQueue));
}

function normalizeMessage(message) {
  if (typeof message === "string") {
    return message.trim();
  }

  if (message && typeof message === "object" && typeof message.message === "string") {
    return message.message.trim();
  }

  return String(message ?? "").trim();
}

function inferToastType(message) {
  const text = normalizeMessage(message).toLowerCase();

  if (
    /(thĂ nh cĂ´ng|da |Ä‘Ă£ |Ä‘Ă£ |hoĂ n táº¥t|hoan tat|Ä‘Ă£ gá»­i|da gui|Ä‘Ă£ lÆ°u|da luu|Ä‘Ă£ xĂ³a|da xoa)/i.test(text)
  ) {
    return "success";
  }

  if (/(vui lĂ²ng|vui long|hĂ£y|hay|Ä‘Äƒng nháº­p|dang nhap)/i.test(text)) {
    return "warning";
  }

  if (
    /(lá»—i|loi|khĂ´ng|khong|tháº¥t báº¡i|that bai|háº¿t háº¡n|het han|khĂ´ng thá»ƒ|error|fail)/i.test(
      text,
    )
  ) {
    return "error";
  }

  return "info";
}

function clearToastTimer(id) {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
}

function scheduleDismiss(id, duration) {
  if (!duration || duration <= 0) {
    return;
  }

  clearToastTimer(id);
  const timer = window.setTimeout(() => {
    dismissToast(id);
  }, duration);
  timers.set(id, timer);
}

function pushToast({
  message,
  type = "info",
  duration,
  title = "",
  actionLabel = "",
  imageUrl = "",
  imageAlt = "",
  imageFallback = "",
  onClick = null,
  closeOnClick = true,
}) {
  const text = normalizeMessage(message);
  if (!text) {
    return null;
  }

  const id = nextToastId++;
  const toastItem = {
    id,
    type,
    title: title ? String(title).trim() : "",
    message: text,
    actionLabel: actionLabel ? String(actionLabel).trim() : "",
    imageUrl: imageUrl ? String(imageUrl).trim() : "",
    imageAlt: imageAlt ? String(imageAlt).trim() : "",
    imageFallback: imageFallback ? String(imageFallback).trim() : "",
    onClick: typeof onClick === "function" ? onClick : null,
    closeOnClick: closeOnClick !== false,
  };

  toastQueue = [...toastQueue, toastItem];
  emit();
  scheduleDismiss(id, duration ?? (type === "error" ? 5200 : 3600));
  return id;
}

export function dismissToast(id) {
  clearToastTimer(id);
  toastQueue = toastQueue.filter((item) => item.id !== id);
  emit();
}

export function subscribeToasts(listener) {
  listeners.add(listener);
  listener(toastQueue);
  return () => {
    listeners.delete(listener);
  };
}

export function installAlertInterceptor() {
  if (typeof window === "undefined") {
    return () => {};
  }

  const originalAlert = window.alert;
  window.alert = (message) => {
    pushToast({
      message,
      type: inferToastType(message),
    });
  };

  return () => {
    window.alert = originalAlert;
  };
}

export function toastFromError(error, fallbackMessage = "CĂ³ lá»—i xáº£y ra.") {
  const message =
    error?.response?.data?.message ||
    error?.message ||
    fallbackMessage;
  return pushToast({ message, type: "error" });
}

export const toast = {
  show(message, options = {}) {
    if (typeof message === "object" && message !== null && !Array.isArray(message)) {
      return pushToast(message);
    }
    return pushToast({ message, ...options });
  },
  success(message, options = {}) {
    return pushToast({ message, type: "success", ...options });
  },
  error(message, options = {}) {
    return pushToast({ message, type: "error", ...options });
  },
  warning(message, options = {}) {
    return pushToast({ message, type: "warning", ...options });
  },
  info(message, options = {}) {
    return pushToast({ message, type: "info", ...options });
  },
  dismiss: dismissToast,
};
