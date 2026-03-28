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
    /(thành công|da |đã |đã |hoàn tất|hoan tat|đã gửi|da gui|đã lưu|da luu|đã xóa|da xoa)/i.test(text)
  ) {
    return "success";
  }

  if (/(vui lòng|vui long|hãy|hay|đăng nhập|dang nhap)/i.test(text)) {
    return "warning";
  }

  if (
    /(lỗi|loi|không|khong|thất bại|that bai|hết hạn|het han|không thể|error|fail)/i.test(
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

function pushToast({ message, type = "info", duration, title = "" }) {
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

export function toastFromError(error, fallbackMessage = "Có lỗi xảy ra.") {
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
