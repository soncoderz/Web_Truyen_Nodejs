import { useEffect, useRef, useState } from "react";
import {
  EMOTION_OPTIONS,
  getEmotionOption,
} from "../utils/reactions";

export default function ReactionBar({
  summary,
  onReact,
  loading = false,
  compact = false,
  promptLabel = "Tha cam xuc",
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const closeTimerRef = useRef(null);
  const selectedEmotion = getEmotionOption(summary?.userEmotion);
  const hasReactions = Number(summary?.totalCount || 0) > 0;

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const openPicker = () => {
    clearCloseTimer();
    setOpen(true);
  };

  const closePicker = () => {
    clearCloseTimer();
    setOpen(false);
  };

  const scheduleClosePicker = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 180);
  };

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => () => clearCloseTimer(), []);

  return (
    <div
      ref={wrapperRef}
      className={`reaction-bar${compact ? " compact" : ""}${
        hasReactions ? " has-reactions" : " is-empty"
      }${className ? ` ${className}` : ""}`}
      onMouseEnter={openPicker}
      onMouseLeave={scheduleClosePicker}
    >
      <div className="reaction-bar-row">
        <button
          type="button"
          className={`reaction-trigger${selectedEmotion ? " active" : ""}`}
          disabled={loading}
          onClick={() => {
            clearCloseTimer();
            setOpen((value) => !value);
          }}
        >
          <span
            className="reaction-trigger-icon"
            style={selectedEmotion ? { color: selectedEmotion.color } : undefined}
            aria-hidden="true"
          >
            {selectedEmotion?.icon || "\u263A"}
          </span>
          <span className="reaction-trigger-label">
            {selectedEmotion?.label || promptLabel}
          </span>
        </button>

        {(hasReactions || !compact) && (
          <div className="reaction-summary" aria-live="polite">
            {summary?.topReactions?.length > 0 ? (
              <>
                <div className="reaction-top-icons">
                  {summary.topReactions.map((item) => {
                    const option = getEmotionOption(item.emotion);
                    if (!option) {
                      return null;
                    }

                    return (
                      <span
                        key={item.emotion}
                        className="reaction-top-icon"
                        title={`${option.label}: ${item.count}`}
                      >
                        {option.icon}
                      </span>
                    );
                  })}
                </div>
                <span className="reaction-total-count">
                  {Number(summary.totalCount || 0).toLocaleString("vi-VN")}
                </span>
              </>
            ) : (
              <span className="reaction-empty-label">Chua co cam xuc</span>
            )}
          </div>
        )}
      </div>

      {open && (
        <div
          className="reaction-picker"
          role="listbox"
          aria-label="Chon cam xuc"
          onMouseEnter={openPicker}
          onMouseLeave={scheduleClosePicker}
        >
          {EMOTION_OPTIONS.map((option) => {
            const active = summary?.userEmotion === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className={`reaction-option${active ? " active" : ""}`}
                title={option.label}
                onClick={() => {
                  onReact?.(active ? null : option.value);
                  closePicker();
                }}
              >
                <span className="reaction-option-emoji" aria-hidden="true">
                  {option.icon}
                </span>
                {!compact && <span className="reaction-option-label">{option.label}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
