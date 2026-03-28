import { useEffect, useState } from "react";
import {
  dismissToast,
  installAlertInterceptor,
  subscribeToasts,
} from "../services/toast";

const TOAST_ICONS = {
  success: "✓",
  error: "!",
  warning: "!",
  info: "i",
};

export default function ToastViewport() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => subscribeToasts(setToasts), []);
  useEffect(() => installAlertInterceptor(), []);

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast-item toast-${toast.type}`}>
          <div className="toast-icon" aria-hidden="true">
            {TOAST_ICONS[toast.type] || TOAST_ICONS.info}
          </div>
          <div className="toast-body">
            {toast.title && <div className="toast-title">{toast.title}</div>}
            <div className="toast-message">{toast.message}</div>
          </div>
          <button
            type="button"
            className="toast-close"
            aria-label="Đóng thông báo"
            onClick={() => dismissToast(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
