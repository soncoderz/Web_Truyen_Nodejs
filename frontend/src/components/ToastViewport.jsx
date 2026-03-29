import { useEffect, useState } from "react";
import {
  dismissToast,
  installAlertInterceptor,
  subscribeToasts,
} from "../services/toast";

const TOAST_ICONS = {
  success: "\u2713",
  error: "!",
  warning: "!",
  info: "i",
};

function ToastMedia({ toast }) {
  const [imageFailed, setImageFailed] = useState(false);
  const hasImage = Boolean(toast.imageUrl) && !imageFailed;
  const fallbackLabel = String(toast.imageFallback || toast.imageAlt || toast.title || "")
    .trim()
    .slice(0, 1)
    .toUpperCase();

  if (hasImage) {
    return (
      <div className="toast-media" aria-hidden="true">
        <img
          src={toast.imageUrl}
          alt={toast.imageAlt || toast.title || "Toast image"}
          onError={() => setImageFailed(true)}
        />
      </div>
    );
  }

  if (toast.imageUrl || toast.imageFallback) {
    return (
      <div className="toast-media toast-media-fallback" aria-hidden="true">
        {fallbackLabel || (TOAST_ICONS[toast.type] || TOAST_ICONS.info)}
      </div>
    );
  }

  return (
    <div className="toast-icon" aria-hidden="true">
      {TOAST_ICONS[toast.type] || TOAST_ICONS.info}
    </div>
  );
}

export default function ToastViewport() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => subscribeToasts(setToasts), []);
  useEffect(() => installAlertInterceptor(), []);

  const handleToastClick = (toast) => {
    if (typeof toast.onClick !== "function") {
      return;
    }

    toast.onClick();
    if (toast.closeOnClick) {
      dismissToast(toast.id);
    }
  };

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast-item toast-${toast.type}${toast.onClick ? " toast-clickable" : ""}${
            toast.imageUrl || toast.imageFallback ? " toast-has-media" : ""
          }`}
          role={toast.onClick ? "button" : undefined}
          tabIndex={toast.onClick ? 0 : undefined}
          onClick={toast.onClick ? () => handleToastClick(toast) : undefined}
          onKeyDown={
            toast.onClick
              ? (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleToastClick(toast);
                  }
                }
              : undefined
          }
        >
          <ToastMedia toast={toast} />
          <div className="toast-body">
            {toast.title && <div className="toast-title">{toast.title}</div>}
            <div className="toast-message">{toast.message}</div>
            {toast.actionLabel && <div className="toast-action">{toast.actionLabel}</div>}
          </div>
          <button
            type="button"
            className="toast-close"
            aria-label="Dong thong bao"
            onClick={(event) => {
              event.stopPropagation();
              dismissToast(toast.id);
            }}
          >
            x
          </button>
        </div>
      ))}
    </div>
  );
}
